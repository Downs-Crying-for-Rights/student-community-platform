import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createNotification } from "@/lib/notification";

/**
 * POST /api/psych/match/[id]
 * Listener claims a confide request.
 * - Requires auth + psychAccess
 * - Find the confide request by id
 * - Must be in WAITING status
 * - Listener cannot match their own request
 * - Update status to MATCHED, set listenerId
 * - Create notification for requester
 *
 * Validates: Requirements 8.5, 12.3
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const listenerId = req.user.id;

    // Check psychAccess
    const user = await prisma.user.findUnique({
      where: { id: listenerId },
      select: { psychAccess: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (!user.psychAccess) {
      return NextResponse.json({ error: "无心理区访问权限" }, { status: 403 });
    }

    // Find the confide request
    const confideRequest = await prisma.confideRequest.findUnique({
      where: { id },
    });

    if (!confideRequest) {
      return NextResponse.json({ error: "倾诉请求不存在" }, { status: 404 });
    }

    if (confideRequest.status !== "WAITING") {
      return NextResponse.json(
        { error: "该请求已被领取" },
        { status: 409 },
      );
    }

    // Listener cannot match their own request
    if (confideRequest.requesterId === listenerId) {
      return NextResponse.json(
        { error: "不能领取自己的倾诉请求" },
        { status: 400 },
      );
    }

    // Update status to MATCHED
    const updated = await prisma.confideRequest.update({
      where: { id },
      data: {
        status: "MATCHED",
        listenerId,
      },
    });

    // Create notification for requester
    await createNotification(
      confideRequest.requesterId,
      "PSYCH_MATCH",
      "倾诉请求已被领取",
      "有倾听者领取了您的倾诉请求，可以开始匿名对话了",
    );

    return NextResponse.json({
      confideRequest: {
        id: updated.id,
        summary: updated.summary,
        anonymousId: updated.anonymousId,
        status: updated.status,
        createdAt: updated.createdAt,
      },
    });
  } catch (error) {
    console.error("POST /api/psych/match/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
