import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * GET /api/psych/queue
 * Listener gets the confide matching queue.
 * - Requires auth + psychAccess
 * - Returns WAITING confide requests
 * - Only show: id, summary, anonymousId, createdAt
 * - Do NOT expose requesterId (critical for anonymity)
 * - Order by createdAt asc (oldest first)
 *
 * Validates: Requirements 8.5, 12.2
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    // Check psychAccess
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { psychAccess: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (!user.psychAccess) {
      return NextResponse.json({ error: "无心理区访问权限" }, { status: 403 });
    }

    const requests = await prisma.confideRequest.findMany({
      where: { status: "WAITING" },
      select: {
        id: true,
        summary: true,
        anonymousId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ queue: requests });
  } catch (error) {
    console.error("GET /api/psych/queue error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
