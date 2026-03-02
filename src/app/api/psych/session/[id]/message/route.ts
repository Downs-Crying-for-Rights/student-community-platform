import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { scanContent } from "@/lib/sensitive-engine";
import { createNotification } from "@/lib/notification";
import { z } from "zod";

const messageSchema = z.object({
  content: z.string().min(1).max(2000),
});

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

    // Determine receiver
    const receiverId =
      confideRequest.requesterId === userId
        ? confideRequest.listenerId!
        : confideRequest.requesterId;

    // Scan content for risk trigger words
    const matches = await scanContent(parsed.data.content);
    const riskMatches = matches.filter((m) => m.category === "RISK");
    let riskDetected = false;

    if (riskMatches.length > 0) {
      riskDetected = true;

      // Notify all moderators — find one moderator to notify
      const moderators = await prisma.user.findMany({
        where: { role: { in: ["MODERATOR", "ADMIN"] } },
        select: { id: true },
      });

      for (const mod of moderators) {
        await createNotification(
          mod.id,
          "SYSTEM",
          "倾听会话风险预警",
          `倾听会话 ${id} 中检测到风险触发词，请及时关注`,
        );
      }
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        content: parsed.data.content,
        isAnonymous: true,
        senderId: userId,
        receiverId,
        sessionId: id,
      },
    });

    // If session is MATCHED, upgrade to ACTIVE
    if (confideRequest.status === "MATCHED") {
      await prisma.confideRequest.update({
        where: { id },
        data: { status: "ACTIVE" },
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
    console.error("POST /api/psych/session/[id]/message error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
