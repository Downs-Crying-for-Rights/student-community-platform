import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { canTransition } from "@/lib/task-state-machine";
import { TaskStatus } from "@prisma/client";

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
      include: { helpSession: { select: { helperId: true } } } as any,
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if ((task as any).helpSession?.helperId !== userId) {
      return NextResponse.json({ error: "只有领取该任务的互助人才能开始处理" }, { status: 403 });
    }

    if (!canTransition(task.status as any, "IN_PROGRESS")) {
      return NextResponse.json({ error: `当前状态 ${task.status} 不允许开始处理` }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.mutualAidTask.update({
        where: { id },
        data: { status: TaskStatus.IN_PROGRESS },
      }),
      prisma.taskTimelineEvent.create({
        data: {
          taskId: id,
          action: "start",
          oldStatus: TaskStatus.CLAIMED,
          newStatus: TaskStatus.IN_PROGRESS,
          operatorId: userId,
        },
      }),
    ]);

    await logAudit(userId, "TASK_START", "TASK", id, {});

    return NextResponse.json({ status: TaskStatus.IN_PROGRESS });
  } catch (error) {
    console.error("POST /api/dcr/tasks/[id]/start error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
