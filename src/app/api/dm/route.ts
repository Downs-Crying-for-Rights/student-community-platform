import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { logAudit } from "@/lib/audit";
import { requireDMConsent } from "@/lib/dm-consent";
import { SYSTEM_ANNOUNCEMENT_USER_ID } from "@/lib/announcement";
import { cursorWhere, encodeCompoundCursor, parseCompoundCursor } from "@/lib/compound-cursor";

async function consentRequired(userId: string) {
  const consent = await requireDMConsent(userId);
  return consent
    ? NextResponse.json({ error: "使用私信前需要同意私信巡查授权", code: "DM_CONSENT_REQUIRED", consent }, { status: 428 })
    : null;
}

const createThreadSchema = z.object({
  participantId: z.string().trim().min(1, "无效的用户 ID").max(191, "用户 ID 过长"),
});

/**
 * POST /api/dm
 * Create or get a DM thread between the current user and another user.
 * - Requires auth
 * - Returns existing thread if one exists, otherwise creates a new one
 * - Any authenticated, non-banned user can start a one-to-one thread
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;
    const consentResponse = await consentRequired(userId);
    if (consentResponse) return consentResponse;

    const body = await req.json();
    const parsed = createThreadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { participantId } = parsed.data;

    const rateLimited = await enforceRateLimit(`dm-thread-create:${userId}`, 20, 60_000);
    if (rateLimited) return rateLimited.response as unknown as NextResponse;

    // Cannot DM self
    if (participantId === userId) {
      return NextResponse.json({ error: "不能给自己发私信" }, { status: 400 });
    }

    // Check recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true, allowDirectMessages: true },
    });
    if (!recipient) {
      return NextResponse.json({ error: "接收用户不存在" }, { status: 404 });
    }
    if (recipient.id === SYSTEM_ANNOUNCEMENT_USER_ID) {
      return NextResponse.json({ error: "不能主动向平台公告账号发起私信" }, { status: 403 });
    }
    if (recipient.allowDirectMessages === false) {
      return NextResponse.json({ error: "对方已关闭私信" }, { status: 403 });
    }

    // Find existing thread (order-independent)
    const [p1, p2] = userId < participantId ? [userId, participantId] : [participantId, userId];

    const thread = await prisma.dMThread.upsert({
      where: {
        participant1Id_participant2Id: {
          participant1Id: p1,
          participant2Id: p2,
        },
      },
      update: {},
      create: {
        participant1Id: p1,
        participant2Id: p2,
      },
    });

    await logAudit(userId, "DM_THREAD_OPEN", "DM_THREAD", thread.id, { participantId });
    return NextResponse.json({ thread });
  } catch (error) {
    console.error("POST /api/dm error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });

/**
 * GET /api/dm
 * List DM threads for the current user, ordered by most recent activity.
 * - Requires auth
 * - Includes last message preview
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;
    const consentResponse = await consentRequired(userId);
    if (consentResponse) return consentResponse;

    const url = new URL(req.url);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? parseCompoundCursor(cursorValue, `dm-threads:${userId}`, "older") : null;
    if (cursorValue && !cursor) return NextResponse.json({ error: "无效的分页游标" }, { status: 400 });
    const requestedPageSize = Number(url.searchParams.get("pageSize") ?? 20);
    const pageSize = Number.isInteger(requestedPageSize) ? Math.min(50, Math.max(1, requestedPageSize)) : 20;

    const threads = await prisma.dMThread.findMany({
      where: {
        AND: [
          { OR: [{ participant1Id: userId }, { participant2Id: userId }] },
          ...(cursor ? [cursorWhere(cursor, "older", "updatedAt")] : []),
        ],
      },
      include: {
        participant1: { select: { id: true, nickname: true, avatar: true } },
        participant2: { select: { id: true, nickname: true, avatar: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, createdAt: true, senderId: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });

    // Map to include the "other" participant
    const hasMore = threads.length > pageSize;
    const page = threads.slice(0, pageSize);
    const result = page.map((t) => {
      const other = t.participant1Id === userId ? t.participant2 : t.participant1;
      return {
        id: t.id,
        other,
        lastMessage: t.messages[0] ?? null,
        updatedAt: t.updatedAt,
      };
    });

    const last = page.at(-1);
    return NextResponse.json({
      threads: result,
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? encodeCompoundCursor(`dm-threads:${userId}`, "older", { id: last.id, createdAt: last.updatedAt })
          : null,
      },
    });
  } catch (error) {
    console.error("GET /api/dm error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
