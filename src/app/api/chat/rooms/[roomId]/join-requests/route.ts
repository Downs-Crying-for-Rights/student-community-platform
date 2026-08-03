import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { findActiveChatRoomBan } from "@/lib/chat-room-membership-policy";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * GET /api/chat/rooms/[roomId]/join-requests
 * List pending join requests. Only room OWNER/ADMIN or SUPER_ADMIN can view.
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const userId = req.user.id;
    const { roomId } = context.params;

    const membership = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    const isOwnerOrAdmin = membership && (membership.role === "OWNER" || membership.role === "ADMIN");
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";

    // Non-owners can only see their own request
    if (!isOwnerOrAdmin && !isSuperAdmin) {
      const myReq = await prisma.chatRoomJoinRequest.findUnique({
        where: { roomId_userId: { roomId, userId } },
        select: { id: true, status: true, createdAt: true, userId: true },
      });
      return NextResponse.json({ requests: myReq ? [myReq] : [] });
    }

    // Owners/Admins see all pending
    const requests = await prisma.chatRoomJoinRequest.findMany({
      where: { roomId, status: "PENDING" },
      include: {
        user: {
          select: { id: true, nickname: true, avatar: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("GET /api/chat/rooms/[roomId]/join-requests error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * POST /api/chat/rooms/[roomId]/join-requests
 * Submit a join request for an approval-mode public room.
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
      select: { id: true, joinMode: true, type: true, status: true },
    });

    if (!room) {
      return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    }

    if (room.status !== "APPROVED") {
      return NextResponse.json({ error: "该群聊尚未通过平台审核" }, { status: 403 });
    }

    if (room.joinMode !== "APPROVAL") {
      return NextResponse.json({ error: "此群聊不需要审核加入" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const activeBan = await findActiveChatRoomBan(tx, roomId, userId);
      if (activeBan) return { kind: "BANNED" as const };

      const existingMember = await tx.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (existingMember) return { kind: "EXISTS" as const };

      const joinRequest = await tx.chatRoomJoinRequest.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: { roomId, userId, status: "PENDING" },
        update: { status: "PENDING", reviewedBy: null },
      });
      return { kind: "CREATED" as const, joinRequest };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "BANNED") {
      return NextResponse.json({ error: "你当前被禁止申请加入此群聊" }, { status: 403 });
    }
    if (result.kind === "EXISTS") {
      return NextResponse.json({ error: "你已在此群聊中" }, { status: 409 });
    }
    return NextResponse.json({ request: result.joinRequest }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chat/rooms/[roomId]/join-requests error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
