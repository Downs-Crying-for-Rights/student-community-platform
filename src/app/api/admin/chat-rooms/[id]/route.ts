import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { sendUserMail } from "@/lib/mail";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(500).optional(),
});

/** 审核公开群聊（版主及以上）。 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const parsed = reviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "审核参数无效" }, { status: 400 });
    }

    const room = await prisma.chatRoom.findUnique({
      where: { id: context.params.id },
      select: { id: true, name: true, type: true, status: true, createdById: true },
    });
    if (!room) {
      return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    }
    if (room.type !== "PUBLIC") {
      return NextResponse.json({ error: "私密群聊不需要平台审核" }, { status: 400 });
    }
    if (room.status !== "PENDING") {
      return NextResponse.json({ error: "该群聊已完成审核" }, { status: 409 });
    }
    if (parsed.data.action === "REJECT" && !parsed.data.reason) {
      return NextResponse.json({ error: "拒绝时必须填写原因" }, { status: 400 });
    }

    const nextStatus = parsed.data.action === "APPROVE" ? "APPROVED" : "REJECTED";
    await prisma.$transaction([
      prisma.chatRoom.update({
        where: { id: room.id },
        data: { status: nextStatus },
      }),
      prisma.notification.create({
        data: {
          type: "SYSTEM",
          title: nextStatus === "APPROVED" ? "群聊审核通过" : "群聊审核未通过",
          content: nextStatus === "APPROVED"
            ? `您创建的公开群聊「${room.name}」已通过审核`
            : `您创建的公开群聊「${room.name}」未通过审核，原因：${parsed.data.reason}`,
          userId: room.createdById,
          link: "/messages?tab=chat",
        },
      }),
    ]);

    const notificationTitle = nextStatus === "APPROVED" ? "群聊审核通过" : "群聊审核未通过";
    const notificationContent = nextStatus === "APPROVED"
      ? `您创建的公开群聊「${room.name}」已通过审核`
      : `您创建的公开群聊「${room.name}」未通过审核，原因：${parsed.data.reason}`;
    await sendUserMail({
      userId: room.createdById,
      subject: notificationTitle,
      text: `${notificationContent}。\n\n查看群聊：${(process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "")}/messages?tab=chat`,
    });

    await logAudit(
      req.user.id,
      nextStatus === "APPROVED" ? "CHAT_ROOM_APPROVE" : "CHAT_ROOM_REJECT",
      "CHAT_ROOM",
      room.id,
      {
        name: room.name,
        previousStatus: room.status,
        newStatus: nextStatus,
        reason: parsed.data.reason || null,
      },
    );

    return NextResponse.json({ success: true, status: nextStatus });
  } catch (error) {
    console.error("PATCH /api/admin/chat-rooms/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
