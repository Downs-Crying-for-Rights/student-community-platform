import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const createThreadSchema = z.object({
  participantId: z.string().cuid("无效的用户 ID"),
});

/**
 * POST /api/dm
 * Create or get a DM thread between the current user and another user.
 * - Requires auth
 * - Returns existing thread if one exists, otherwise creates a new one
 * - Checks trustLevel: sender must have trustLevel ≥ 1
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

    // Cannot DM self
    if (participantId === userId) {
      return NextResponse.json({ error: "不能给自己发私信" }, { status: 400 });
    }

    // Check trustLevel for DM
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { reputationScore: true, createdAt: true },
    });
    if (!sender) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }
    const { computeTrustLevel, canSendDM } = await import("@/lib/trust-level");
    const { getAccountAgeDays } = await import("@/lib/utils");
    const trustLevel = computeTrustLevel(sender.reputationScore);
    const accountAgeDays = getAccountAgeDays(sender.createdAt);
    if (!canSendDM(trustLevel, accountAgeDays)) {
      return NextResponse.json(
        { error: `信任等级不足 (当前 L${trustLevel})，无法发送私信` },
        { status: 403 },
      );
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

    const existing = await prisma.dMThread.findUnique({
      where: { participant1Id_participant2Id: p1, participant2Id: p2 } as any,
    });

    if (existing) {
      return NextResponse.json({ thread: existing });
    }

    const thread = await prisma.dMThread.create({
      data: {
        participant1Id: p1,
        participant2Id: p2,
      },
    });

    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    console.error("POST /api/dm error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

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
});
