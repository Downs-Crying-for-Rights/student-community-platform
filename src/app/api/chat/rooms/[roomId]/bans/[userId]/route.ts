import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { hasMinimumRole, withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { canManageChatRoomMember } from "@/lib/chat-room-membership-policy";

const banSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
const unbanSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

async function getModerationContext(roomId: string, actorId: string, targetId: string) {
  const [room, actor, target] = await Promise.all([
    prisma.chatRoom.findUnique({ where: { id: roomId }, select: { createdById: true } }),
    prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: actorId } },
      select: { role: true },
    }),
    prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetId } },
      select: { role: true },
    }),
  ]);
  return { room, actorRole: actor?.role, targetRole: target?.role };
}

/** PUT permanently bans a user and removes any membership/pending request. */
export const PUT = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { roomId, userId } = context.params;
    const parsed = banSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "封禁原因不能超过 500 字" }, { status: 400 });
    }

    const { room, actorRole, targetRole } = await getModerationContext(roomId, req.user.id, userId);
    if (!room) return NextResponse.json({ error: "群聊不存在" }, { status: 404 });

    const effectiveTargetRole = targetRole ?? (room.createdById === userId ? "OWNER" : "MEMBER");
    if (effectiveTargetRole === "OWNER") {
      return NextResponse.json({ error: "不能封禁群主" }, { status: 400 });
    }
    const isPlatformModerator = hasMinimumRole(req.user.role, "MODERATOR");
    if (!canManageChatRoomMember(actorRole, effectiveTargetRole, isPlatformModerator)) {
      return NextResponse.json({ error: "无权封禁此用户" }, { status: 403 });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.chatRoomBan.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: {
          roomId,
          userId,
          imposedById: req.user.id,
          reason: parsed.data.reason,
          createdAt: now,
          expiresAt: null,
        },
        update: {
          imposedById: req.user.id,
          reason: parsed.data.reason,
          createdAt: now,
          expiresAt: null,
          revokedAt: null,
          revokedById: null,
          revokeReason: null,
        },
      });
      await tx.chatRoomMember.deleteMany({ where: { roomId, userId } });
      await tx.chatRoomJoinRequest.updateMany({
        where: { roomId, userId, status: "PENDING" },
        data: { status: "REJECTED", reviewedBy: req.user.id },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await logAudit(req.user.id, AuditAction.CHAT_MEMBER_BAN, AuditTargetType.CHAT_ROOM, roomId, {
      userId,
      reason: parsed.data.reason,
      expiresAt: null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/chat/rooms/[roomId]/bans/[userId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/** DELETE revokes an active ban. It never restores room membership. */
export const DELETE = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { roomId, userId } = context.params;
    const parsed = unbanSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "解封原因不能超过 500 字" }, { status: 400 });
    }

    const { room, actorRole } = await getModerationContext(roomId, req.user.id, userId);
    if (!room) return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    const isPlatformModerator = hasMinimumRole(req.user.role, "MODERATOR");
    if (!isPlatformModerator && actorRole !== "OWNER" && actorRole !== "ADMIN") {
      return NextResponse.json({ error: "无权解除封禁" }, { status: 403 });
    }

    const now = new Date();
    const result = await prisma.chatRoomBan.updateMany({
      where: {
        roomId,
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: {
        revokedAt: new Date(),
        revokedById: req.user.id,
        revokeReason: parsed.data.reason,
      },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "有效封禁不存在" }, { status: 404 });
    }

    await logAudit(req.user.id, AuditAction.CHAT_MEMBER_UNBAN, AuditTargetType.CHAT_ROOM, roomId, {
      userId,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/chat/rooms/[roomId]/bans/[userId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
