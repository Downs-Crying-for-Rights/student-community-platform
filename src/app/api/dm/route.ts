import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { logAudit } from "@/lib/audit";

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
      select: { id: true },
    });
    if (!recipient) {
      return NextResponse.json({ error: "接收用户不存在" }, { status: 404 });
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

    const threads = await prisma.dMThread.findMany({
      where: {
        OR: [
          { participant1Id: userId },
          { participant2Id: userId },
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
      orderBy: { updatedAt: "desc" },
    });

    // Map to include the "other" participant
    const result = threads.map((t) => {
      const other = t.participant1Id === userId ? t.participant2 : t.participant1;
      return {
        id: t.id,
        other,
        lastMessage: t.messages[0] ?? null,
        updatedAt: t.updatedAt,
      };
    });

    return NextResponse.json({ threads: result });
  } catch (error) {
    console.error("GET /api/dm error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
