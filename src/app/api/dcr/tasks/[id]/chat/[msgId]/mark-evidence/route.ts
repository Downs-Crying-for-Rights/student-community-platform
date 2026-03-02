import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/** Roles that can access HelpChat alongside A and B */
const PRIVILEGED_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * POST /api/dcr/tasks/[id]/chat/[msgId]/mark-evidence
 * Mark a chat message as evidence and create a NOTE entry in the EvidenceRoom.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Sets isEvidence=true on the message
 * - Creates EvidenceItem of type NOTE with the message content
 *
 * Validates: Requirements 3.6
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id: taskId, msgId } = context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find task with helpSession (including helpChat and evidenceRoom)
    const task = await (prisma as any).mutualAidTask.findUnique({
      where: { id: taskId },
      include: {
        helpSession: {
          include: {
            helpChat: true,
            evidenceRoom: true,
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

    // Verify access: requester, helper, or privileged role
    const isRequester = task.helpSession.requesterId === userId;
    const isHelper = task.helpSession.helperId === userId;
    const isPrivileged = PRIVILEGED_ROLES.includes(
      userRole as (typeof PRIVILEGED_ROLES)[number],
    );

    if (!isRequester && !isHelper && !isPrivileged) {
      return NextResponse.json({ error: "无权访问此聊天" }, { status: 403 });
    }

    const chat = task.helpSession.helpChat;
    const evidenceRoom = task.helpSession.evidenceRoom;

    if (!chat) {
      return NextResponse.json({ error: "聊天通道不存在" }, { status: 404 });
    }

    if (!evidenceRoom) {
      return NextResponse.json({ error: "证据空间不存在" }, { status: 404 });
    }

    // Find the message by msgId in the helpChat
    const message = await (prisma as any).helpChatMessage.findFirst({
      where: { id: msgId, chatId: chat.id },
    });

    if (!message) {
      return NextResponse.json({ error: "消息不存在" }, { status: 404 });
    }

    // Transaction: mark message as evidence + create EvidenceRoom NOTE entry
    const updated = await prisma.$transaction(async (tx: any) => {
      const updatedMsg = await tx.helpChatMessage.update({
        where: { id: msgId },
        data: { isEvidence: true },
        select: { id: true, isEvidence: true },
      });

      await tx.evidenceItem.create({
        data: {
          type: "NOTE",
          description: message.content,
          roomId: evidenceRoom.id,
          uploaderId: userId,
        },
      });

      return updatedMsg;
    });

    return NextResponse.json({ id: updated.id, isEvidence: true });
  } catch (error) {
    console.error("POST /api/dcr/tasks/[id]/chat/[msgId]/mark-evidence error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
