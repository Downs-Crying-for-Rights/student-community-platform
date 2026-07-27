import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { canTransition } from "@/lib/task-state-machine";
import { TaskStatus } from "@prisma/client";
import { aggregateHelpSessionStatus } from "@/lib/task-state-machine";
import { notifyMutualAidUsersBestEffort } from "@/lib/mutual-aid-notifications";

/**
 * POST /api/dcr/tasks/[id]/start
 * Advance a CLAIMED task to IN_PROGRESS.
 * Only the claimed helper can do this.
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;

    const task = await prisma.mutualAidTask.findUnique({
      where: { id },
      include: { helpSessions: { select: { id: true, helperId: true, status: true } } },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const session = task.helpSessions.find((item) => item.helperId === userId);
    if (!session) {
      return NextResponse.json({ error: "只有领取该任务的互助人才能开始处理" }, { status: 403 });
    }

    if (session.status !== "CLAIMED") {
      return NextResponse.json({ error: `当前会话状态 ${session.status} 不允许开始处理` }, { status: 400 });
    }

    const status = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-task:${id}`}))`;
      const currentTask = await tx.mutualAidTask.findUnique({ where: { id }, select: { status: true } });
      const currentSession = await tx.helpSession.findUnique({
        where: { id: session.id },
        select: { helperId: true, status: true },
      });
      if (!currentTask || !currentSession || currentSession.helperId !== userId) throw new Error("SESSION_NOT_FOUND");
      if (currentSession.status !== "CLAIMED") throw new Error("SESSION_STATE_CHANGED");
      const updated = await tx.helpSession.updateMany({
        where: { id: session.id, status: "CLAIMED" },
        data: { status: "IN_PROGRESS" },
      });
      if (updated.count === 0) throw new Error("SESSION_STATE_CHANGED");
      const sessions = await tx.helpSession.findMany({ where: { taskId: id }, select: { status: true } });
      const aggregate = aggregateHelpSessionStatus(sessions.map((item) => item.status));
      await tx.mutualAidTask.updateMany({ where: { id }, data: { status: aggregate } });
      await tx.taskTimelineEvent.create({
        data: {
          taskId: id,
          action: "start",
          oldStatus: currentTask.status,
          newStatus: aggregate,
          details: `[session:${session.id}]`,
          operatorId: userId,
        },
      });
      await logAudit(userId, "TASK_START", "TASK", id, { sessionId: session.id }, undefined, tx);
      return aggregate;
    });

    await notifyMutualAidUsersBestEffort([task.requesterId], {
      title: "互助会话已开始",
      content: `互助任务「${task.title}」的一项互助会话已开始处理。`,
      link: `/dcr/tasks/${id}`,
    });

    return NextResponse.json({ status, sessionId: session.id, sessionStatus: TaskStatus.IN_PROGRESS });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_STATE_CHANGED") {
      return NextResponse.json({ error: "会话状态已变化，请刷新后重试" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
      return NextResponse.json({ error: "互助会话不存在" }, { status: 404 });
    }
    console.error("POST /api/dcr/tasks/[id]/start error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
