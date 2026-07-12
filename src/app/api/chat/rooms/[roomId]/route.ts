import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

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
        _count: { select: { members: true } },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    }

    // Check access: public room or member
    const isMember = room.members.some((m) => m.userId === userId);
    if (room.type !== "PUBLIC" && !isMember && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "无权访问此私密群聊" }, { status: 403 });
    }

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        type: room.type,
        createdBy: room.createdBy,
        members: room.members.map((m) => ({
          role: m.role,
          joinedAt: m.joinedAt,
          ...m.user,
        })),
        memberCount: room._count.members,
        updatedAt: room.updatedAt,
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
      select: { id: true, type: true },
    });

    if (!room) {
      return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    }

    const existing = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (existing) {
      return NextResponse.json({ error: "你已在此群聊中" }, { status: 409 });
    }

    const member = await prisma.chatRoomMember.create({
      data: { roomId, userId, role: "MEMBER" },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chat/rooms/[roomId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
