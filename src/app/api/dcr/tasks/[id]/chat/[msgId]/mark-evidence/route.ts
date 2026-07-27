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

    const message = await prisma.helpChatMessage.findFirst({
      where: { id: msgId, chat: { session: { taskId } } },
      include: {
        chat: {
          include: {
            session: { include: { evidenceRoom: true } },
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json({ error: "消息不存在" }, { status: 404 });
    }

    const session = message.chat.session;
    const isRequester = session.requesterId === userId;
    const isHelper = session.helperId === userId;
    const isPrivileged = PRIVILEGED_ROLES.includes(
      userRole as (typeof PRIVILEGED_ROLES)[number],
    );

    if (!isRequester && !isHelper && !isPrivileged) {
      return NextResponse.json({ error: "无权访问此聊天" }, { status: 403 });
    }

    const evidenceRoom = session.evidenceRoom;
    if (!evidenceRoom) {
      return NextResponse.json({ error: "证据空间不存在" }, { status: 404 });
    }

    // Transaction: mark message as evidence + create EvidenceRoom NOTE entry
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-task:${taskId}`}))`;
      const current = await tx.helpSession.findUnique({ where: { id: session.id }, select: { status: true } });
      if (!current || ["DISPUTED", "COMPLETED", "CLOSED"].includes(current.status)) {
        throw new Error("SESSION_READ_ONLY");
      }
      const marked = await tx.helpChatMessage.updateMany({
        where: { id: msgId, isEvidence: false },
        data: { isEvidence: true },
      });

      if (marked.count === 0) return { id: msgId, isEvidence: true };

      await tx.evidenceItem.create({
        data: {
          type: "NOTE",
          description: message.content,
          roomId: evidenceRoom.id,
          uploaderId: userId,
        },
      });

      return { id: msgId, isEvidence: true };
    });

    return NextResponse.json({ id: updated.id, isEvidence: true });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_READ_ONLY") {
      return NextResponse.json({ error: "当前会话已暂停或结束，不能标记证据" }, { status: 409 });
    }
    console.error("POST /api/dcr/tasks/[id]/chat/[msgId]/mark-evidence error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
