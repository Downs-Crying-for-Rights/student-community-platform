import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { closeTaskSchema } from "@/lib/validators";
import { aggregateHelpSessionStatus, canTransition, type TaskStatus } from "@/lib/task-state-machine";
import { checkCompletionRequirements } from "@/lib/task-completion";
import { logAudit } from "@/lib/audit";
import { notifyMutualAidUsersBestEffort } from "@/lib/mutual-aid-notifications";

/** Roles allowed to force-close a task */
const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * POST /api/dcr/tasks/[id]/close
 * Handle task closure: request, confirm, or force-close.
 *
 * - action=request: A or B initiates closure.
 *   Sets the corresponding confirmed flag (requesterConfirmed / helperConfirmed).
 *   If task is IN_PROGRESS, transitions to EVIDENCE_PENDING.
 *   If both parties have now confirmed, proceeds to completion.
 *
 * - action=confirm: The other party confirms closure.
 *   Checks evidence completeness via checkCompletionRequirements.
 *   If both confirmed → COMPLETED and generates completionReport.
 *
 * - action=force: Moderator/Admin force-closes the task.
 *   Requires reason. Transitions to COMPLETED regardless of confirmation state.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Parse and validate body
    const body = await req.json();
    const parsed = closeTaskSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { action, reason, sessionId } = parsed.data;

    // Load task with session and evidence
    const task = await prisma.mutualAidTask.findUnique({
      where: { id },
      include: {
        helpSessions: {
          include: {
            evidenceRoom: {
              include: { items: { select: { type: true } } },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (task.helpSessions.length === 0) {
      return NextResponse.json({ error: "互助会话不存在" }, { status: 404 });
    }

    const isRequester = task.requesterId === userId;
    const isHelper = task.helpSessions.some((session) => session.helperId === userId);
    const isModerator = MODERATOR_ROLES.includes(
      userRole as (typeof MODERATOR_ROLES)[number],
    );

    // ==================== action=force ====================
    if (action === "force") {
      if (!isModerator) {
        return NextResponse.json({ error: "仅管理员可强制结案" }, { status: 403 });
      }
      if (!reason) {
        return NextResponse.json({ error: "强制结案必须提供原因" }, { status: 400 });
      }

      // Force-close: allow from EVIDENCE_PENDING or any state that can transition to COMPLETED
      if (task.status !== "EVIDENCE_PENDING" &&
          !canTransition(task.status as TaskStatus, "COMPLETED" as TaskStatus)) {
        return NextResponse.json(
          { error: `当前状态 ${task.status} 不允许结案` },
          { status: 400 },
        );
      }

      const completionReport = generateCompletionReport(task, "force", reason);

      const updated = await prisma.$transaction(async (tx) => {
        const updatedTask = await tx.mutualAidTask.update({
          where: { id },
          data: {
            status: "COMPLETED",
            requesterConfirmed: true,
            helperConfirmed: true,
            closureReason: reason,
            completionReport: completionReport as any,
          },
        });

        await tx.taskTimelineEvent.create({
          data: {
            taskId: id,
            action: "force_close",
            oldStatus: task.status,
            newStatus: "COMPLETED",
            details: reason,
            operatorId: userId,
          },
        });

        return updatedTask;
      });

      await logAudit(userId, "TASK_FORCE_CLOSE", "TASK", id, {
        oldStatus: task.status,
        reason,
      });

      return NextResponse.json({
        status: updated.status,
        completionReport,
      });
    }

    if (!isRequester && !isHelper) {
      return NextResponse.json({ error: "仅互助双方可操作" }, { status: 403 });
    }
    const activeSessions = task.helpSessions.filter((session) =>
      !["COMPLETED", "CLOSED"].includes(session.status),
    );
    if (isRequester && !sessionId && activeSessions.length > 1) {
      return NextResponse.json({ error: "请选择要结案的互助会话" }, { status: 400 });
    }
    const selected = activeSessions.find((session) =>
      session.id === (sessionId ?? activeSessions[0]?.id)
      && (isRequester || session.helperId === userId),
    );
    if (!selected) return NextResponse.json({ error: "互助会话不存在" }, { status: 404 });
    if (!["IN_PROGRESS", "EVIDENCE_PENDING"].includes(selected.status)) {
      return NextResponse.json({ error: `当前会话状态 ${selected.status} 不允许结案操作` }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.helpSession.update({
        where: { id: selected.id },
        data: {
          ...(isRequester ? { requesterConfirmed: true } : { helperConfirmed: true }),
          ...(action === "request" && selected.status === "IN_PROGRESS" ? { status: "EVIDENCE_PENDING" } : {}),
        },
      });
      const current = await tx.helpSession.findUniqueOrThrow({
        where: { id: selected.id },
        include: { evidenceRoom: { include: { items: { select: { type: true } } } } },
      });
      let sessionStatus = current.status;
      const bothConfirmed = current.requesterConfirmed && current.helperConfirmed;
      if (bothConfirmed) {
        const check = checkCompletionRequirements(current.evidenceRoom?.items ?? []);
        if (!check.canComplete) throw new Error("EVIDENCE_INCOMPLETE");
        await tx.helpSession.update({
          where: { id: selected.id },
          data: { status: "COMPLETED", closedAt: new Date() },
        });
        sessionStatus = "COMPLETED";
      }
      const statuses = await tx.helpSession.findMany({ where: { taskId: id }, select: { status: true } });
      const status = aggregateHelpSessionStatus(statuses.map((item) => item.status));
      await tx.mutualAidTask.updateMany({ where: { id }, data: { status } });
      await tx.taskTimelineEvent.create({
        data: {
          taskId: id,
          action: bothConfirmed ? "complete" : action === "request" ? "close_request" : "close_confirm",
          oldStatus: task.status,
          newStatus: status,
          details: `[session:${selected.id}]`,
          operatorId: userId,
        },
      });
      return { status, sessionStatus, bothConfirmed };
    });

    await logAudit(userId, result.bothConfirmed ? "TASK_COMPLETE" : action === "request" ? "TASK_CLOSE_REQUEST" : "TASK_CLOSE_CONFIRM", "TASK", id, {
      sessionId: selected.id,
    });
    const counterpartId = isRequester ? selected.helperId : task.requesterId;
    await notifyMutualAidUsersBestEffort([counterpartId], {
      title: result.bothConfirmed ? "互助会话已结案" : "收到互助结案请求",
      content: `互助任务「${task.title}」的一项会话状态已更新。`,
      link: `/dcr/tasks/${id}`,
    });
    return NextResponse.json({ status: result.status, sessionId: selected.id, sessionStatus: result.sessionStatus });
  } catch (error) {
    if (error instanceof Error && error.message === "EVIDENCE_INCOMPLETE") {
      return NextResponse.json({ error: "证据不完整，无法结案" }, { status: 400 });
    }
    console.error("POST /api/dcr/tasks/[id]/close error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * Complete a task: verify evidence, transition to COMPLETED, and generate a report.
 */
async function completeTask(
  taskId: string,
  task: any,
  userId: string,
  currentStatus: string,
): Promise<NextResponse> {
  // Check evidence completeness
  const evidenceItems = task.helpSessions?.flatMap((session: any) => session.evidenceRoom?.items ?? []) ?? [];
  const check = checkCompletionRequirements(evidenceItems);

  if (!check.canComplete) {
    const missing: string[] = [];
    if (check.missingProcess) missing.push("过程证据（EVIDENCE_ITEM 或 NOTE）");
    if (check.missingOutcome) missing.push("结果/回访条目（OUTCOME 或 FOLLOW_UP）");
    return NextResponse.json(
      { error: "证据不完整，无法结案", missing },
      { status: 400 },
    );
  }

  // Verify state transition
  const targetStatus: TaskStatus = "COMPLETED";
  if (currentStatus !== "EVIDENCE_PENDING" &&
      !canTransition(currentStatus as TaskStatus, targetStatus)) {
    return NextResponse.json(
      { error: `当前状态 ${currentStatus} 不允许转为 COMPLETED` },
      { status: 400 },
    );
  }

  const completionReport = generateCompletionReport(task, "mutual", undefined);

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTask = await tx.mutualAidTask.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        requesterConfirmed: true,
        helperConfirmed: true,
        completionReport: completionReport as any,
      },
    });

    await tx.taskTimelineEvent.create({
      data: {
        taskId,
        action: "complete",
        oldStatus: currentStatus,
        newStatus: "COMPLETED",
        details: "双方确认结案",
        operatorId: userId,
      },
    });

    return updatedTask;
  });

  await logAudit(userId, "TASK_COMPLETE", "TASK", taskId, {
    oldStatus: currentStatus,
  });

  return NextResponse.json({
    status: updated.status,
    completionReport,
  });
}

/**
 * Generate a completion report for the task.
 */
function generateCompletionReport(
  task: any,
  closeType: "mutual" | "force",
  reason: string | undefined,
) {
  const evidenceItems = task.helpSessions?.flatMap((session: any) => session.evidenceRoom?.items ?? []) ?? [];
  return {
    taskId: task.id,
    title: task.title,
    closeType,
    closedAt: new Date().toISOString(),
    forceReason: reason ?? null,
    summary: `互助任务「${task.title}」已${closeType === "force" ? "强制" : ""}结案`,
    evidenceCount: evidenceItems.length,
    evidenceTypes: [...new Set(evidenceItems.map((e: any) => e.type))] as string[],
    timeline: {
      created: task.createdAt?.toISOString?.() ?? String(task.createdAt),
      completed: new Date().toISOString(),
    },
  };
}
