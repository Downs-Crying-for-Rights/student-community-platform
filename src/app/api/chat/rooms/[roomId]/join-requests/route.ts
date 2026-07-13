import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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
      } as any,
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

    if (room.joinMode !== "APPROVAL" || room.type !== "PUBLIC") {
      return NextResponse.json({ error: "此群聊不需要审核加入" }, { status: 400 });
    }

    // Check if already a member
    const existingMember = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (existingMember) {
      return NextResponse.json({ error: "你已在此群聊中" }, { status: 409 });
    }

    // Upsert request (re-apply if previously rejected)
    const joinRequest = await prisma.chatRoomJoinRequest.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId, status: "PENDING" },
      update: { status: "PENDING", reviewedBy: null },
    });

    return NextResponse.json({ request: joinRequest }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chat/rooms/[roomId]/join-requests error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
