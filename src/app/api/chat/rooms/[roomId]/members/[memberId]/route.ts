import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { hasMinimumRole, withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import {
  canManageChatRoomMember,
  moderationBanExpiresAt,
} from "@/lib/chat-room-membership-policy";

const moderationSchema = z.object({
  action: z.enum(["KICK", "BAN"]).default("KICK"),
  reason: z.string().trim().max(500).optional(),
});

/**
 * DELETE /api/chat/rooms/[roomId]/members/[memberId]
 * 默认踢出并限制 24 小时重新加入；action=BAN 时永久封禁。
 */
export const DELETE = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { roomId, memberId } = context.params;
    const rawBody = await req.json().catch(() => ({}));
    const parsed = moderationSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "参数错误，action 应为 KICK 或 BAN" }, { status: 400 });
    }

    const [actor, target] = await Promise.all([
      prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId: req.user.id } },
        select: { role: true },
      }),
      prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId: memberId } },
        select: { userId: true, role: true },
      }),
    ]);

    if (!target) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }
    if (target.role === "OWNER") {
      return NextResponse.json({ error: "不能移除或封禁群主" }, { status: 400 });
    }

    const isPlatformModerator = hasMinimumRole(req.user.role, "MODERATOR");
    if (!canManageChatRoomMember(actor?.role, target.role, isPlatformModerator)) {
      const error = target.role === "ADMIN" ? "仅群主可处理群管理员" : "无权处理此成员";
      return NextResponse.json({ error }, { status: 403 });
    }

    const { action, reason } = parsed.data;
    const now = new Date();
    const expiresAt = moderationBanExpiresAt(action, now);

    await prisma.$transaction(async (tx) => {
      await tx.chatRoomBan.upsert({
        where: { roomId_userId: { roomId, userId: memberId } },
        create: {
          roomId,
          userId: memberId,
          imposedById: req.user.id,
          reason,
          createdAt: now,
          expiresAt,
        },
        update: {
          imposedById: req.user.id,
          reason,
          createdAt: now,
          expiresAt,
          revokedAt: null,
          revokedById: null,
          revokeReason: null,
        },
      });
      await tx.chatRoomMember.deleteMany({ where: { roomId, userId: memberId } });
      await tx.chatRoomJoinRequest.updateMany({
        where: { roomId, userId: memberId, status: "PENDING" },
        data: { status: "REJECTED", reviewedBy: req.user.id },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await logAudit(
      req.user.id,
      action === "BAN" ? AuditAction.CHAT_MEMBER_BAN : AuditAction.CHAT_MEMBER_KICK,
      AuditTargetType.CHAT_ROOM,
      roomId,
      { userId: memberId, role: target.role, reason, expiresAt: expiresAt?.toISOString() ?? null },
    );

    return NextResponse.json({ success: true, action, expiresAt });
  } catch (error) {
    console.error("DELETE /api/chat/rooms/[roomId]/members/[memberId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
