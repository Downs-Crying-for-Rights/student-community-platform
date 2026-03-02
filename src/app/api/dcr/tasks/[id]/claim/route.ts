import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/dcr/tasks/[id]/claim
 * Claim an OPEN mutual aid task.
 * - Requires auth + dcrAccess
 * - Verifies task is OPEN and requester is not the claimer
 * - Uses Prisma transaction with optimistic lock (where status: OPEN) for mutual exclusion
 * - Creates HelpSession, HelpChat (with system privacy prompt), EvidenceRoom, and timeline event
 * - Returns sessionId, chatId, evidenceRoomId
 *
 * Validates: Requirements 2.5, 2.6, 3.1, 3.2, 3.3, 4.1
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;

    // Check dcrAccess
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dcrAccess: true },
    });

    if (!user?.dcrAccess) {
      return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
    }

    // Find the task
    const task = await prisma.mutualAidTask.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (task.status !== "OPEN") {
      return NextResponse.json({ error: "任务当前状态不可领取" }, { status: 400 });
    }

    if (task.requesterId === userId) {
      return NextResponse.json({ error: "不能领取自己发起的任务" }, { status: 400 });
    }

    // Use transaction with optimistic lock for mutual exclusion
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Optimistic lock: only update if status is still OPEN
        const updated = await tx.mutualAidTask.updateMany({
          where: { id, status: "OPEN" },
          data: { status: "CLAIMED" },
        });

        if (updated.count === 0) {
          throw new Error("CONFLICT");
        }

        // Create HelpSession
        const session = await tx.helpSession.create({
          data: {
            taskId: id,
            helperId: userId,
            requesterId: task.requesterId,
          },
        });

        // Create HelpChat
        const chat = await tx.helpChat.create({
          data: {
            sessionId: session.id,
          },
        });

        // Create system privacy prompt message
        await tx.helpChatMessage.create({
          data: {
            chatId: chat.id,
            content: "请注意保护隐私，不要发送实名、手机号、精确学校地址等敏感信息",
            isSystemMessage: true,
            senderId: userId,
          },
        });

        // Create EvidenceRoom
        const evidenceRoom = await tx.evidenceRoom.create({
          data: {
            sessionId: session.id,
          },
        });

        // Record timeline event
        await tx.taskTimelineEvent.create({
          data: {
            taskId: id,
            action: "claim",
            oldStatus: "OPEN",
            newStatus: "CLAIMED",
            operatorId: userId,
          },
        });

        return {
          sessionId: session.id,
          chatId: chat.id,
          evidenceRoomId: evidenceRoom.id,
        };
      });

      // Audit log
      await logAudit(userId, "TASK_CLAIM", "TASK", id, {
        sessionId: result.sessionId,
        chatId: result.chatId,
        evidenceRoomId: result.evidenceRoomId,
      });

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "CONFLICT") {
        return NextResponse.json({ error: "任务已被领取" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error("POST /api/dcr/tasks/[id]/claim error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
