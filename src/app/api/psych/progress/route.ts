import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/** GET /api/psych/progress - return database-authoritative psychology access state. */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const [user, application] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: { psychAccess: true },
      }),
      prisma.accessApplication.findFirst({
        where: { applicantId: req.user.id, type: "PSYCHOLOGY" },
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({
      accessGranted: user.psychAccess,
      application,
    });
  } catch (error) {
    console.error("GET /api/psych/progress error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
