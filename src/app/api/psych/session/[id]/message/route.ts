import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { scanContent } from "@/lib/sensitive-engine";
import { createNotification } from "@/lib/notification";
import { z } from "zod";
import { sendAdminActionMail } from "@/lib/mail";

const messageSchema = z.object({
  content: z.string().min(1).max(2000),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

class PsychSessionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "PsychSessionError";
  }
}

/**
 * POST /api/psych/session/[id]/message
 * Send a message in a confide session.
 * - Requires auth, must be requester or listener
 * - Session must be MATCHED or ACTIVE status
 * - Messages are anonymous (isAnonymous=true, use sessionId)
 * - Run scanContent on message for risk trigger words
 * - If RISK category detected: notify Moderator, return warning flag
 *
 * Validates: Requirements 12.3, 12.4, 12.5, 8.7, 8.8
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;

    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { psychAccess: true },
    });
    if (!sender?.psychAccess) {
      return NextResponse.json({ error: "心理区访问权限已失效" }, { status: 403 });
    }

    const confideRequest = await prisma.confideRequest.findUnique({
      where: { id },
    });

    if (!confideRequest) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    // Must be requester or listener
    if (
      confideRequest.requesterId !== userId &&
      confideRequest.listenerId !== userId
    ) {
      return NextResponse.json({ error: "无权发送消息" }, { status: 403 });
    }

    // Session must be MATCHED or ACTIVE
    if (!["MATCHED", "ACTIVE"].includes(confideRequest.status)) {
      return NextResponse.json(
        { error: "会话未处于活跃状态" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Scan content for risk trigger words
    const matches = await scanContent(parsed.data.content);
    const riskMatches = matches.filter((m) => m.category === "RISK");
    let riskDetected = false;

    if (riskMatches.length > 0) riskDetected = true;

    const message = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`psych-session:${id}`}))`;
      const currentSender = await tx.user.findUnique({ where: { id: userId }, select: { psychAccess: true } });
      if (!currentSender?.psychAccess) throw new PsychSessionError(403, "心理区访问权限已失效");
      const current = await tx.confideRequest.findUnique({ where: { id } });
      if (!current) throw new PsychSessionError(404, "会话不存在");
      if (current.requesterId !== userId && current.listenerId !== userId) {
        throw new PsychSessionError(403, "无权发送消息");
      }
      if (current.expiresAt <= new Date()) throw new PsychSessionError(410, "会话已过期");
      if (!current.listenerId || !["MATCHED", "ACTIVE"].includes(current.status)) {
        throw new PsychSessionError(409, "会话未处于活跃状态");
      }
      const receiverId = current.requesterId === userId ? current.listenerId : current.requesterId;
      const created = await tx.message.create({
        data: {
          content: parsed.data.content,
          isAnonymous: true,
          senderId: userId,
          receiverId,
          sessionId: id,
        },
      });
      if (current.status === "MATCHED") {
        await tx.confideRequest.updateMany({
          where: { id, status: "MATCHED" },
          data: { status: "ACTIVE" },
        });
      }
      return created;
    });

    if (riskDetected) {
      const moderators = await prisma.user.findMany({
        where: { role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] } },
        select: { id: true },
      });
      await Promise.allSettled(moderators.map((mod) => createNotification(
        mod.id,
        "SYSTEM",
        "倾听会话风险预警",
        `倾听会话 ${id} 中检测到风险触发词，请及时关注`,
      )));
    }

    if (riskDetected) {
      await sendAdminActionMail({
        minimumRole: "MODERATOR",
        subject: "倾听会话风险预警",
        text: `倾听会话 ${id} 中检测到风险触发词，请及时介入处理。`,
        actionUrl: "/admin/reports",
      });
    }

    return NextResponse.json({
      message: {
        id: message.id,
        content: message.content,
        isAnonymous: message.isAnonymous,
        createdAt: message.createdAt,
        sessionId: message.sessionId,
      },
      riskDetected,
    });
  } catch (error) {
    if (error instanceof PsychSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/psych/session/[id]/message error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/** Participant-only paginated history for the retained confide feature. */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
    const session = await prisma.confideRequest.findUnique({
      where: { id: context.params.id },
      select: { requesterId: true, listenerId: true },
    });
    if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    if (session.requesterId !== req.user.id && session.listenerId !== req.user.id) {
      return NextResponse.json({ error: "无权查看消息" }, { status: 403 });
    }
    const { page, pageSize } = parsed.data;
    const where = { sessionId: context.params.id };
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        select: { id: true, content: true, isAnonymous: true, senderId: true, createdAt: true, sessionId: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.message.count({ where }),
    ]);
    return NextResponse.json({ messages, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) {
    console.error("GET /api/psych/session/[id]/message error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
