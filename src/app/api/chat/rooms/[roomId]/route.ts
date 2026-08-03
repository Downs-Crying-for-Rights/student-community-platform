import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { findActiveChatRoomBan } from "@/lib/chat-room-membership-policy";
import { hasMinimumRole, withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * GET /api/chat/rooms/[roomId] — 获取群聊详情（含成员列表）
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const userId = req.user.id;
    const { roomId } = context.params;

    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        createdBy: { select: { id: true, nickname: true, avatar: true } },
        members: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        joinRequests: {
          where: { userId },
          select: { id: true, status: true },
        },
        _count: { select: { members: true } },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    }

    // Pending/rejected public rooms are visible only to members and moderators.
    const isMember = room.members.some((m) => m.userId === userId);
    const canReview = hasMinimumRole(req.user.role, "MODERATOR");
    const isApproved = room.status === "APPROVED";
    if (!isApproved && !isMember && !canReview) {
      return NextResponse.json({ error: "无权访问此私密群聊" }, { status: 403 });
    }

    return NextResponse.json({
      room: {
        id: room.id,
        roomNumber: room.roomNumber,
        name: room.name,
        description: room.description,
        type: room.type,
        status: room.status,
        joinMode: room.joinMode,
        createdBy: room.createdBy,
        members: (isMember || canReview ? room.members : []).map((m) => ({
          role: m.role,
          joinedAt: m.joinedAt,
          ...m.user,
        })),
        memberCount: room._count.members,
        isMember,
        updatedAt: room.updatedAt,
        joinRequest: room.joinRequests[0] ?? null,
      },
    });
  } catch (error) {
    console.error("GET /api/chat/rooms/[roomId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * POST /api/chat/rooms/[roomId] — 加入群聊
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const userId = req.user.id;
    const { roomId } = context.params;

    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { id: true, type: true, status: true, joinMode: true },
    });

    if (!room) {
      return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    }

    if (room.status !== "APPROVED") {
      return NextResponse.json({ error: "该群聊尚未通过审核或不可公开加入" }, { status: 403 });
    }

    if (room.joinMode !== "DIRECT") {
      return NextResponse.json({ error: "该群聊需要提交加入申请" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const activeBan = await findActiveChatRoomBan(tx, roomId, userId);
      if (activeBan) return { kind: "BANNED" as const, activeBan };

      const existing = await tx.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (existing) return { kind: "EXISTS" as const };

      const member = await tx.chatRoomMember.create({
        data: { roomId, userId, role: "MEMBER" },
      });
      return { kind: "CREATED" as const, member };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "BANNED") {
      return NextResponse.json({ error: "你当前被禁止加入此群聊" }, { status: 403 });
    }
    if (result.kind === "EXISTS") {
      return NextResponse.json({ error: "你已在此群聊中" }, { status: 409 });
    }
    return NextResponse.json({ member: result.member }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chat/rooms/[roomId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
