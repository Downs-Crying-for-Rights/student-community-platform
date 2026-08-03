import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";
import { scanContent } from "@/lib/sensitive-engine";
import { cursorWhere, encodeCompoundCursor, parseCompoundCursor } from "@/lib/compound-cursor";
import { createNotification } from "@/lib/notification";

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  mentionedUserIds: z.array(z.string().min(1).max(191)).max(20).default([]),
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
    const cursorValue = searchParams.get("cursor");
    const directionValue = searchParams.get("direction") ?? "older";
    if (directionValue !== "older" && directionValue !== "newer") {
      return NextResponse.json({ error: "无效的分页方向" }, { status: 400 });
    }
    if (searchParams.has("before") || searchParams.has("after")) {
      return NextResponse.json({ error: "不支持混用分页游标" }, { status: 400 });
    }
    const direction = directionValue;
    const cursor = cursorValue ? parseCompoundCursor(cursorValue, `chat-room:${roomId}`, direction) : null;
    if (cursorValue && !cursor) return NextResponse.json({ error: "无效的分页游标" }, { status: 400 });
    const requestedTake = Number(searchParams.get("limit") ?? 30);
    const take = Number.isInteger(requestedTake) ? Math.min(100, Math.max(1, requestedTake)) : 30;

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(cursor ? cursorWhere(cursor, direction) : {}),
      },
      orderBy: [
        { createdAt: direction === "newer" ? "asc" : "desc" },
        { id: direction === "newer" ? "asc" : "desc" },
      ],
      take: take + 1,
    });

    const hasMore = messages.length > take;
    const sliced = messages.slice(0, take);
    const result = direction === "newer" ? sliced : sliced.toReversed();

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
      pagination: {
        hasMore,
        olderCursor: direction === "older" && hasMore && sliced.length
          ? encodeCompoundCursor(`chat-room:${roomId}`, "older", sliced.at(-1)!)
          : null,
        newerCursor: result.length
          ? encodeCompoundCursor(`chat-room:${roomId}`, "newer", result.at(-1)!)
          : null,
      },
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
    const mentionedUserIds = [...new Set(parsed.data.mentionedUserIds)].filter((id) => id !== userId);

    // Verify membership
    const isMember = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!isMember && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "请先加入群聊" }, { status: 403 });
    }

    if (mentionedUserIds.length > 0) {
      const memberCount = await prisma.chatRoomMember.count({
        where: { roomId, userId: { in: mentionedUserIds } },
      });
      if (memberCount !== mentionedUserIds.length) {
        return NextResponse.json({ error: "只能提及当前群聊的成员" }, { status: 400 });
      }
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

    await Promise.all(mentionedUserIds.map((mentionedUserId) => createNotification(
      mentionedUserId,
      "SYSTEM",
      `你在群聊中被 ${sender?.nickname?.trim() || "一名成员"} 提及`,
      content.slice(0, 120),
      `/chat/${roomId}`,
    ).catch((error) => console.error("Failed to create chat mention notification", error))));

    return NextResponse.json({
      message: {
        ...message,
        sender: sender ?? { id: userId, nickname: null, avatar: null },
      },
      newerCursor: encodeCompoundCursor(`chat-room:${roomId}`, "newer", message),
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chat/rooms/[roomId]/messages error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
