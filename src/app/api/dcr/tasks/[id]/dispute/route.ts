import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { disputeTaskSchema } from "@/lib/validators";
import { canTransition, type TaskStatus } from "@/lib/task-state-machine";
import { logAudit } from "@/lib/audit";

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

    const { explanation } = parsed.data;

    // Load task with helpSession
    const task = await (prisma as any).mutualAidTask.findUnique({
      where: { id },
      include: { helpSession: true },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (!task.helpSession) {
      return NextResponse.json({ error: "互助会话不存在" }, { status: 404 });
    }

    // Verify user is requester or helper
    const isRequester = task.requesterId === userId;
    const isHelper = task.helpSession.helperId === userId;

    if (!isRequester && !isHelper) {
      return NextResponse.json({ error: "仅互助双方可发起争议" }, { status: 403 });
    }

    // Verify state transition is allowed
    if (!canTransition(task.status as TaskStatus, "DISPUTED")) {
      return NextResponse.json(
        { error: `当前状态 ${task.status} 不允许发起争议` },
        { status: 400 },
      );
    }

    // Transition to DISPUTED in a transaction
    const oldStatus = task.status;

    await prisma.$transaction(async (tx) => {
      await (tx as any).mutualAidTask.update({
        where: { id },
        data: { status: "DISPUTED" },
      });

      await (tx as any).taskTimelineEvent.create({
        data: {
          taskId: id,
          action: "dispute",
          oldStatus,
          newStatus: "DISPUTED",
          details: explanation,
          operatorId: userId,
        },
      });
    });

    await logAudit(userId, "TASK_DISPUTE", "TASK", id, { explanation });

    return NextResponse.json({ status: "DISPUTED" });
  } catch (error) {
    console.error("POST /api/dcr/tasks/[id]/dispute error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
