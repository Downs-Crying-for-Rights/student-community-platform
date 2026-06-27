import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { scanContent } from "@/lib/sensitive-engine";
import { z } from "zod";

const sendMessageSchema = z.object({
  content: z.string().min(1, "消息不能为空").max(5000, "消息不能超过 5000 字"),
});

/**
 * GET /api/dm/thread/[threadId]
 * Get messages for a DM thread, with pagination.
 * - Requires auth
 * - Verifies user is a participant of the thread
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const userId = req.user.id;
    const { threadId } = context.params;

    // Verify user is participant
    const thread = await prisma.dMThread.findUnique({
      where: { id: threadId },
      select: { participant1Id: true, participant2Id: true },
    });

    if (!thread) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    if (thread.participant1Id !== userId && thread.participant2Id !== userId) {
      return NextResponse.json({ error: "无权访问此会话" }, { status: 403 });
    }

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const take = Math.min(50, parseInt(url.searchParams.get("limit") || "30", 10));

    const messages = await prisma.dMMessage.findMany({
      where: {
        threadId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    });

    const hasMore = messages.length > take;
    const result = messages.slice(0, take).reverse();

    return NextResponse.json({
      messages: result,
      nextCursor: hasMore ? result[0].createdAt.toISOString() : null,
      hasMore,
    });
  } catch (error) {
    console.error("GET /api/dm/thread/[threadId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * POST /api/dm/thread/[threadId]
 * Send a message in a DM thread.
 * - Requires auth
 * - Verifies user is a participant
 * - Scans for sensitive content
 * - Updates thread updatedAt
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const userId = req.user.id;
    const { threadId } = context.params;

    const body = await req.json();
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { content } = parsed.data;

    // Verify user is participant
    const thread = await prisma.dMThread.findUnique({
      where: { id: threadId },
      select: { participant1Id: true, participant2Id: true },
    });

    if (!thread) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    if (thread.participant1Id !== userId && thread.participant2Id !== userId) {
      return NextResponse.json({ error: "无权在此会话中发消息" }, { status: 403 });
    }

    // Sensitive content scan
    const matches = await scanContent(content);
    if (matches.length > 0) {
      const categories = [...new Set(matches.map((m) => m.category))];
      return NextResponse.json(
        {
          error: "消息包含敏感信息，请修改后重发",
          details: { categories, hitCount: matches.length },
        },
        { status: 400 },
      );
    }

    // Create message and update thread timestamp
    const [message] = await prisma.$transaction([
      prisma.dMMessage.create({
        data: {
          threadId,
          senderId: userId,
          content,
        },
      }),
      prisma.dMThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("POST /api/dm/thread/[threadId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
