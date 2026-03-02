import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * POST /api/psych/apply
 * Submit a psychology zone access application.
 * - Requires authentication
 * - Returns 409 if user already has psychAccess
 * - Returns 409 if user already has a PENDING application
 * - Creates AccessApplication with type=PSYCHOLOGY, status=PENDING
 *
 * Validates: Requirements 8.1, 8.2
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    // Check if user already has psychAccess
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { psychAccess: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (user.psychAccess) {
      return NextResponse.json(
        { error: "您已拥有心理区访问权限" },
        { status: 409 },
      );
    }

    // Check if user already has a PENDING application
    const pendingApplication = await prisma.accessApplication.findFirst({
      where: {
        applicantId: userId,
        type: "PSYCHOLOGY",
        status: "PENDING",
      },
    });

    if (pendingApplication) {
      return NextResponse.json(
        { error: "您已有待审核的心理区准入申请" },
        { status: 409 },
      );
    }

    // Create application
    const application = await prisma.accessApplication.create({
      data: {
        type: "PSYCHOLOGY",
        status: "PENDING",
        applicantId: userId,
      },
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    console.error("POST /api/psych/apply error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
