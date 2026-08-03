import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { scanContent } from "@/lib/sensitive-engine";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { logAudit } from "@/lib/audit";
import { requireDMConsent } from "@/lib/dm-consent";
import { createNotification } from "@/lib/notification";
import { cursorWhere, encodeCompoundCursor, parseCompoundCursor } from "@/lib/compound-cursor";

async function consentRequired(userId: string) {
  const consent = await requireDMConsent(userId);
  return consent
    ? NextResponse.json({ error: "使用私信前需要同意私信巡查授权", code: "DM_CONSENT_REQUIRED", consent }, { status: 428 })
    : null;
}

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
    const consentResponse = await consentRequired(userId);
    if (consentResponse) return consentResponse;
    const { threadId } = context.params;

    // Verify user is participant
    const thread = await prisma.dMThread.findUnique({
      where: { id: threadId },
      select: { participant1Id: true, participant2Id: true, isSystemReadOnly: true },
    });

    if (!thread) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    if (thread.participant1Id !== userId && thread.participant2Id !== userId) {
      return NextResponse.json({ error: "无权访问此会话" }, { status: 403 });
    }

    const url = new URL(req.url);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? parseCompoundCursor(cursorValue, `dm:${threadId}`, "older") : null;
    if (cursorValue && !cursor) {
      return NextResponse.json({ error: "无效的分页游标" }, { status: 400 });
    }
    const requestedTake = Number(url.searchParams.get("limit") ?? 30);
    const take = Number.isInteger(requestedTake) ? Math.min(50, Math.max(1, requestedTake)) : 30;

    const messages = await prisma.dMMessage.findMany({
      where: {
        threadId,
        ...(cursor ? cursorWhere(cursor, "older") : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
    });

    const hasMore = messages.length > take;
    const page = messages.slice(0, take);
    const result = page.toReversed();

    return NextResponse.json({
      messages: result,
      nextCursor: hasMore && page.length ? encodeCompoundCursor(`dm:${threadId}`, "older", page.at(-1)!) : null,
      hasMore,
      isSystemReadOnly: thread.isSystemReadOnly,
    });
  } catch (error) {
    console.error("GET /api/dm/thread/[threadId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });

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
    const consentResponse = await consentRequired(userId);
    if (consentResponse) return consentResponse;
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

    const rateLimited = await enforceRateLimit(`dm-message-send:${userId}`, 30, 60_000);
    if (rateLimited) return rateLimited.response as unknown as NextResponse;

    // Verify user is participant
    const thread = await prisma.dMThread.findUnique({
      where: { id: threadId },
      select: { participant1Id: true, participant2Id: true, isSystemReadOnly: true },
    });

    if (!thread) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    if (thread.participant1Id !== userId && thread.participant2Id !== userId) {
      return NextResponse.json({ error: "无权在此会话中发消息" }, { status: 403 });
    }
    if (thread.isSystemReadOnly) {
      return NextResponse.json({ error: "平台公告私信不支持回复" }, { status: 403 });
    }
    const recipientId = thread.participant1Id === userId ? thread.participant2Id : thread.participant1Id;
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { allowDirectMessages: true },
    });
    if (recipient?.allowDirectMessages === false) {
      return NextResponse.json({ error: "对方已关闭私信" }, { status: 403 });
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

    await logAudit(userId, "DM_MESSAGE_SEND", "DM_THREAD", threadId, { messageId: message.id });
    try {
      await createNotification(
        recipientId,
        "SYSTEM",
        "收到新私信",
        "你收到了一条新的私信消息。",
        `/messages/dm/${threadId}`,
      );
    } catch (error) {
      console.error("Failed to create DM recipient notification", error);
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("POST /api/dm/thread/[threadId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
