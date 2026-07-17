import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { findActiveChatRoomBan } from "@/lib/chat-room-membership-policy";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

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
    const reviewerId = req.user.id;
    const { roomId, reqId } = context.params;

    const membership = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: reviewerId } },
    });
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      if (req.user.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "仅群主和管理员可审批加入申请" }, { status: 403 });
      }
    }

    const parsed = reviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "参数错误，action 应为 APPROVE 或 REJECT" }, { status: 400 });
    }
    const { action } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const joinRequest = await tx.chatRoomJoinRequest.findUnique({ where: { id: reqId } });
      if (!joinRequest || joinRequest.roomId !== roomId) return { kind: "NOT_FOUND" as const };
      if (joinRequest.status !== "PENDING") return { kind: "PROCESSED" as const };

      if (action === "APPROVE") {
        const activeBan = await findActiveChatRoomBan(tx, roomId, joinRequest.userId);
        if (activeBan) {
          await tx.chatRoomJoinRequest.updateMany({
            where: { id: reqId, roomId, status: "PENDING" },
            data: { status: "REJECTED", reviewedBy: reviewerId },
          });
          return { kind: "BANNED" as const };
        }
      }

      const claimed = await tx.chatRoomJoinRequest.updateMany({
        where: { id: reqId, roomId, status: "PENDING" },
        data: {
          status: action === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedBy: reviewerId,
        },
      });
      if (claimed.count !== 1) return { kind: "PROCESSED" as const };

      if (action === "APPROVE") {
        await tx.chatRoomMember.upsert({
          where: { roomId_userId: { roomId, userId: joinRequest.userId } },
          create: { roomId, userId: joinRequest.userId, role: "MEMBER" },
          update: {},
        });
      }
      return { kind: "DONE" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "NOT_FOUND") {
      return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    }
    if (result.kind === "PROCESSED") {
      return NextResponse.json({ error: "该申请已处理" }, { status: 409 });
    }
    if (result.kind === "BANNED") {
      return NextResponse.json({ error: "该用户当前已被禁止加入此群聊" }, { status: 409 });
    }
    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("PATCH /api/chat/rooms/[roomId]/join-requests/[reqId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
