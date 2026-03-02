import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { closeTaskSchema } from "@/lib/validators";
import { canTransition, type TaskStatus } from "@/lib/task-state-machine";
import { checkCompletionRequirements } from "@/lib/task-completion";
import { logAudit } from "@/lib/audit";

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
 *   If both confirmed → COMPLETED, generates completionReport, awards reputation.
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

    const { action, reason } = parsed.data;

    // Load task with session and evidence
    const task = await (prisma as any).mutualAidTask.findUnique({
      where: { id },
      include: {
        helpSession: {
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

    if (!task.helpSession) {
      return NextResponse.json({ error: "互助会话不存在" }, { status: 404 });
    }

    const isRequester = task.requesterId === userId;
    const isHelper = task.helpSession.helperId === userId;
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
        const updatedTask = await (tx as any).mutualAidTask.update({
          where: { id },
          data: {
            status: "COMPLETED",
            requesterConfirmed: true,
            helperConfirmed: true,
            closureReason: reason,
            completionReport: completionReport as any,
          },
        });

        await (tx as any).taskTimelineEvent.create({
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

      // Award reputation to helper
      await awardHelperReputation(task.helpSession.helperId);

      await logAudit(userId, "TASK_FORCE_CLOSE", "TASK", id, {
        oldStatus: task.status,
        reason,
      });

      return NextResponse.json({
        status: updated.status,
        completionReport,
      });
    }

    // ==================== action=request / action=confirm ====================
    // Both require the user to be A or B
    if (!isRequester && !isHelper) {
      return NextResponse.json({ error: "仅互助双方可操作" }, { status: 403 });
    }

    // Validate current status allows closure operations
    const allowedStatuses: TaskStatus[] = ["IN_PROGRESS", "EVIDENCE_PENDING"];
    if (!allowedStatuses.includes(task.status as TaskStatus)) {
      return NextResponse.json(
        { error: `当前状态 ${task.status} 不允许结案操作` },
        { status: 400 },
      );
    }

    if (action === "request") {
      // Set the corresponding confirmed flag
      const updateData: Record<string, any> = {};
      if (isRequester) {
        updateData.requesterConfirmed = true;
      } else {
        updateData.helperConfirmed = true;
      }

      // If task is IN_PROGRESS, transition to EVIDENCE_PENDING
      let newStatus = task.status;
      if (task.status === "IN_PROGRESS") {
        if (!canTransition("IN_PROGRESS", "EVIDENCE_PENDING")) {
          return NextResponse.json(
            { error: "状态转移不合法" },
            { status: 400 },
          );
        }
        updateData.status = "EVIDENCE_PENDING";
        newStatus = "EVIDENCE_PENDING";
      }

      // Check if both parties have now confirmed (including the current request)
      const bothConfirmed =
        (isRequester ? true : task.requesterConfirmed) &&
        (isHelper ? true : task.helperConfirmed);

      if (bothConfirmed) {
        // Both confirmed — proceed to completion
        return await completeTask(id, task, userId, newStatus as string);
      }

      // Only one party confirmed so far
      const updated = await prisma.$transaction(async (tx) => {
        const updatedTask = await (tx as any).mutualAidTask.update({
          where: { id },
          data: updateData,
        });

        await (tx as any).taskTimelineEvent.create({
          data: {
            taskId: id,
            action: "close_request",
            oldStatus: task.status,
            newStatus: newStatus as string,
            details: isRequester ? "求助者发起结案" : "互助者发起结案",
            operatorId: userId,
          },
        });

        return updatedTask;
      });

      await logAudit(userId, "TASK_CLOSE_REQUEST", "TASK", id, {
        oldStatus: task.status,
        newStatus,
        role: isRequester ? "requester" : "helper",
      });

      return NextResponse.json({ status: updated.status });
    }

    if (action === "confirm") {
      // Set the confirming party's flag
      const updateData: Record<string, any> = {};
      if (isRequester) {
        updateData.requesterConfirmed = true;
      } else {
        updateData.helperConfirmed = true;
      }

      // Check if both parties have now confirmed
      const bothConfirmed =
        (isRequester ? true : task.requesterConfirmed) &&
        (isHelper ? true : task.helperConfirmed);

      if (!bothConfirmed) {
        // Still waiting for the other party
        const updated = await prisma.$transaction(async (tx) => {
          const updatedTask = await (tx as any).mutualAidTask.update({
            where: { id },
            data: updateData,
          });

          await (tx as any).taskTimelineEvent.create({
            data: {
              taskId: id,
              action: "close_confirm",
              oldStatus: task.status,
              newStatus: task.status,
              details: isRequester ? "求助者确认结案" : "互助者确认结案",
              operatorId: userId,
            },
          });

          return updatedTask;
        });

        await logAudit(userId, "TASK_CLOSE_CONFIRM", "TASK", id, {
          role: isRequester ? "requester" : "helper",
          bothConfirmed: false,
        });

        return NextResponse.json({ status: updated.status });
      }

      // Both confirmed — proceed to completion
      return await completeTask(id, task, userId, task.status);
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/dcr/tasks/[id]/close error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * Complete a task: verify evidence, transition to COMPLETED, generate report, award reputation.
 */
async function completeTask(
  taskId: string,
  task: any,
  userId: string,
  currentStatus: string,
): Promise<NextResponse> {
  // Check evidence completeness
  const evidenceItems = task.helpSession?.evidenceRoom?.items ?? [];
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
    const updatedTask = await (tx as any).mutualAidTask.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        requesterConfirmed: true,
        helperConfirmed: true,
        completionReport: completionReport as any,
      },
    });

    await (tx as any).taskTimelineEvent.create({
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

  // Award reputation to helper (+10)
  await awardHelperReputation(task.helpSession.helperId);

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
  const evidenceItems = task.helpSession?.evidenceRoom?.items ?? [];
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

/**
 * Award +10 reputation to the helper upon successful task completion.
 */
async function awardHelperReputation(helperId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: helperId },
      data: { reputationScore: { increment: 10 } },
    });
  } catch (error) {
    // Log but don't fail the close operation for reputation errors
    console.error("Failed to update helper reputation:", error);
  }
}
