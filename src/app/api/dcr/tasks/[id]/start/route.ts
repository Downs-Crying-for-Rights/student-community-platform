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

    const status = aggregateHelpSessionStatus(
      task.helpSessions.map((item) => item.id === session.id ? "IN_PROGRESS" : item.status),
    );
    await prisma.$transaction(async (tx) => {
      const updated = await tx.helpSession.updateMany({
        where: { id: session.id, status: "CLAIMED" },
        data: { status: "IN_PROGRESS" },
      });
      if (updated.count === 0) throw new Error("SESSION_STATE_CHANGED");
      await tx.mutualAidTask.updateMany({ where: { id }, data: { status } });
      await tx.taskTimelineEvent.create({
        data: {
          taskId: id,
          action: "start",
          oldStatus: task.status,
          newStatus: status,
          details: `[session:${session.id}]`,
          operatorId: userId,
        },
      });
    });

    await logAudit(userId, "TASK_START", "TASK", id, {});
    await notifyMutualAidUsersBestEffort([task.requesterId], {
      title: "互助会话已开始",
      content: `互助任务「${task.title}」的一项互助会话已开始处理。`,
      link: `/dcr/tasks/${id}`,
    });

    return NextResponse.json({ status, sessionId: session.id, sessionStatus: TaskStatus.IN_PROGRESS });
  } catch (error) {
    console.error("POST /api/dcr/tasks/[id]/start error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
