import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";
import { scanContent } from "@/lib/sensitive-engine";

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

/**
 * GET /api/chat/rooms/[roomId]/messages — 获取消息（游标分页）
 * - 默认取最近 50 条，cursor 往前翻
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
      select: { status: true },
    });
    if (!room) {
      return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    }
    if (room.status !== "APPROVED") {
      return NextResponse.json({ error: "群聊尚未通过平台审核" }, { status: 409 });
    }

    // Verify membership
    const isMember = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!isMember && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "请先加入群聊" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const before = searchParams.get("before"); // message ID cursor for "load older"
    const after = searchParams.get("after");   // message ID cursor for "poll new"
    const take = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30")));

    // Resolve message ID cursors to createdAt timestamps
    let cursorDate: Date | undefined;
    if (cursor) {
      cursorDate = new Date(cursor);
    } else if (before) {
      const beforeMsg = await prisma.chatMessage.findUnique({ where: { id: before }, select: { createdAt: true } });
      if (beforeMsg) cursorDate = beforeMsg.createdAt;
    } else if (after) {
      const afterMsg = await prisma.chatMessage.findUnique({ where: { id: after }, select: { createdAt: true } });
      if (afterMsg) cursorDate = afterMsg.createdAt;
    }

    const isAfterMode = !!after;

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(cursorDate ? { createdAt: isAfterMode ? { gt: cursorDate } : { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: isAfterMode ? "asc" : "desc" },
      take: take + 1,
    });

    const hasMore = messages.length > take;
    const sliced = messages.slice(0, take);
    const result = isAfterMode ? sliced : sliced.reverse();

    const senders = await prisma.user.findMany({
      where: { id: { in: [...new Set(result.map((message) => message.senderId))] } },
      select: { id: true, nickname: true, avatar: true },
    });
    const senderById = new Map(senders.map((sender) => [sender.id, sender]));

    return NextResponse.json({
      messages: result.map((message) => ({
        ...message,
        sender: senderById.get(message.senderId) ?? {
          id: message.senderId,
          nickname: null,
          avatar: null,
        },
      })),
      hasMore,
    });
  } catch (error) {
    console.error("GET /api/chat/rooms/[roomId]/messages error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * POST /api/chat/rooms/[roomId]/messages — 发送消息
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
      select: { status: true },
    });
    if (!room) {
      return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
    }
    if (room.status !== "APPROVED") {
      return NextResponse.json({ error: "群聊尚未通过平台审核" }, { status: 409 });
    }

    const body = await req.json();
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败" },
        { status: 400 },
      );
    }

    const { content } = parsed.data;

    // Verify membership
    const isMember = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!isMember && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "请先加入群聊" }, { status: 403 });
    }

    // Sensitive content scan
    const matches = await scanContent(content);
    if (matches.length > 0) {
      const categories = [...new Set(matches.map((m) => m.category))];
      return NextResponse.json(
        { error: "消息包含敏感信息，请修改后重发", details: { categories } },
        { status: 400 },
      );
    }

    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          roomId,
          senderId: userId,
          content,
        },
      }),
      prisma.chatRoom.update({
        where: { id: roomId },
        data: { updatedAt: new Date() },
      }),
    ]);

    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, avatar: true },
    });

    return NextResponse.json({
      message: {
        ...message,
        sender: sender ?? { id: userId, nickname: null, avatar: null },
      },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chat/rooms/[roomId]/messages error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
