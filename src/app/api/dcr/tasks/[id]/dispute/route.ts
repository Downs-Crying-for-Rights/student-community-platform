import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { disputeTaskSchema } from "@/lib/validators";
import { aggregateHelpSessionStatus, canTransition, type TaskStatus } from "@/lib/task-state-machine";
import { logAudit } from "@/lib/audit";
import {
  notifyMutualAidAdminsBestEffort,
  notifyMutualAidUsersBestEffort,
} from "@/lib/mutual-aid-notifications";
import { sendAdminActionMail } from "@/lib/mail";

/**
 * POST /api/dcr/tasks/[id]/dispute
 * File a dispute on a mutual-aid task.
 *
 * - Only requester (A) or helper (B) may file.
 * - Validates explanation via disputeTaskSchema (min 10 chars).
 * - Transitions task status to DISPUTED, records timeline event.
 * - Reputation deduction happens during moderation (task 8.3), not here.
 *
 * Validates: Requirements 2.8, 5.7, 6.4
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;

    // Parse and validate body
    const body = await req.json();
    const parsed = disputeTaskSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { explanation, sessionId } = parsed.data;

    // Load task with helpSession
    const task = await prisma.mutualAidTask.findUnique({
      where: { id },
      include: { helpSessions: true },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (task.helpSessions.length === 0) {
      return NextResponse.json({ error: "互助会话不存在" }, { status: 404 });
    }

    const isRequester = task.requesterId === userId;
    const eligibleSessions = task.helpSessions.filter((session) =>
      !["COMPLETED", "CLOSED"].includes(session.status),
    );
    if (!isRequester && !eligibleSessions.some((session) => session.helperId === userId)) {
      return NextResponse.json({ error: "仅互助双方可发起争议" }, { status: 403 });
    }

    if (isRequester && !sessionId && eligibleSessions.length > 1) {
      return NextResponse.json({ error: "请选择要发起争议的互助会话" }, { status: 400 });
    }
    const selected = eligibleSessions.find((session) =>
      session.id === (sessionId ?? eligibleSessions[0]?.id)
      && (isRequester || session.helperId === userId),
    );
    if (!selected) return NextResponse.json({ error: "互助会话不存在" }, { status: 404 });
    if (!canTransition(selected.status as TaskStatus, "DISPUTED")) {
      return NextResponse.json({ error: `当前会话状态 ${selected.status} 不允许发起争议` }, { status: 400 });
    }

    // Transition to DISPUTED in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-task:${id}`}))`;
      const currentTask = await tx.mutualAidTask.findUnique({ where: { id }, select: { status: true, requesterId: true } });
      const currentSession = await tx.helpSession.findUnique({
        where: { id: selected.id },
        select: { helperId: true, status: true },
      });
      if (!currentTask || !currentSession) throw new Error("SESSION_STATE_CHANGED");
      if (currentTask.requesterId !== userId && currentSession.helperId !== userId) throw new Error("SESSION_FORBIDDEN");
      if (!canTransition(currentSession.status as TaskStatus, "DISPUTED")) throw new Error("SESSION_STATE_CHANGED");
      const updated = await tx.helpSession.updateMany({
        where: { id: selected.id, status: currentSession.status },
        data: { status: "DISPUTED", statusBeforeDispute: currentSession.status },
      });
      if (updated.count === 0) throw new Error("SESSION_STATE_CHANGED");
      const sessions = await tx.helpSession.findMany({ where: { taskId: id }, select: { status: true } });
      const status = aggregateHelpSessionStatus(sessions.map((session) => session.status));
      await tx.mutualAidTask.updateMany({ where: { id }, data: { status } });

      await tx.taskTimelineEvent.create({
        data: {
          taskId: id,
          action: "dispute",
          oldStatus: currentTask.status,
          newStatus: "DISPUTED",
          details: `[session:${selected.id}]\n${explanation}`,
          operatorId: userId,
        },
      });
      await logAudit(userId, "TASK_DISPUTE", "TASK", id, { explanation, sessionId: selected.id }, undefined, tx);
    });

    const counterpartId = isRequester ? selected.helperId : task.requesterId;
    await notifyMutualAidUsersBestEffort([counterpartId], {
      title: "互助任务已发起争议",
      content: `互助任务「${task.title}」的一项会话已发起争议。`,
      link: `/dcr/tasks/${id}`,
    });
    await notifyMutualAidAdminsBestEffort({
      title: "新的互助争议待处理",
      content: `互助任务「${task.title}」有新的会话争议。`,
      link: "/admin/disputes",
    });
    await sendAdminActionMail({
      minimumRole: "MODERATOR",
      subject: "新的互助争议待仲裁",
      text: `互助任务「${task.title}」有新的会话争议，争议会话：${selected.id}。`,
      actionUrl: "/admin/disputes",
    });

    return NextResponse.json({ status: "DISPUTED", sessionId: selected.id });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_STATE_CHANGED") {
      return NextResponse.json({ error: "会话状态已变化，请刷新后重试" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "SESSION_FORBIDDEN") {
      return NextResponse.json({ error: "仅互助双方可发起争议" }, { status: 403 });
    }
    console.error("POST /api/dcr/tasks/[id]/dispute error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
