import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * GET /api/dcr/progress
 * Return the DCR 4-step progress for the current user.
 * - hasSubmitted: user has at least one Case (any requestStatus)
 * - hasApproved: user has at least one Case with requestStatus = APPROVED
 * - quizPassed: user.quizPassed
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    const [hasSubmitted, hasApproved, user] = await Promise.all([
      prisma.case.count({ where: { submitterId: userId } }),
      prisma.case.count({
        where: { submitterId: userId, requestStatus: "APPROVED" },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { quizPassed: true, dcrAccess: true },
      }),
    ]);

    return NextResponse.json({
      progress: {
        hasSubmitted: hasSubmitted > 0,
        hasApproved: hasApproved > 0,
        quizPassed: user?.quizPassed ?? false,
        dcrAccess: user?.dcrAccess ?? false,
      },
    });
  } catch (error) {
    console.error("GET /api/dcr/progress error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
