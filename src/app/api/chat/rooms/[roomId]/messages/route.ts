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

    // Verify membership
    const isMember = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!isMember && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "请先加入群聊" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const take = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    });

    const hasMore = messages.length > take;
    const result = messages.slice(0, take).reverse();

    return NextResponse.json({
      messages: result,
      nextCursor: hasMore ? result[0]?.createdAt?.toISOString() ?? null : null,
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

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chat/rooms/[roomId]/messages error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
