import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});

/**
 * PATCH /api/chat/rooms/[roomId]/join-requests/[reqId]
 * Approve or reject a join request. Only room OWNER/ADMIN or SUPER_ADMIN.
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const userId = req.user.id;
    const { roomId, reqId } = context.params;

    // Verify ownership/admin
    const membership = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      if (req.user.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "仅群主和管理员可审批加入申请" }, { status: 403 });
      }
    }

    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "参数错误，action 应为 APPROVE 或 REJECT" }, { status: 400 });
    }

    const { action } = parsed.data;

    const joinRequest = await prisma.chatRoomJoinRequest.findUnique({
      where: { id: reqId },
    });

    if (!joinRequest || joinRequest.roomId !== roomId) {
      return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    }

    if (joinRequest.status !== "PENDING") {
      return NextResponse.json({ error: "该申请已处理" }, { status: 409 });
    }

    if (action === "APPROVE") {
      await prisma.$transaction([
        prisma.chatRoomJoinRequest.update({
          where: { id: reqId },
          data: { status: "APPROVED", reviewedBy: userId },
        }),
        prisma.chatRoomMember.upsert({
          where: { roomId_userId: { roomId, userId: joinRequest.userId } },
          create: { roomId, userId: joinRequest.userId, role: "MEMBER" },
          update: {},
        }),
      ]);
    } else {
      await prisma.chatRoomJoinRequest.update({
        where: { id: reqId },
        data: { status: "REJECTED", reviewedBy: userId },
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("PATCH /api/chat/rooms/[roomId]/join-requests/[reqId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
