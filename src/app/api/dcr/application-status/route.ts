import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * GET /api/dcr/application-status
 * 查询当前用户的 DCR 准入申请状态。
 * 返回最近一条 DCR 申请的状态和驳回原因。
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    const application = await prisma.accessApplication.findFirst({
      where: { applicantId: userId, type: "DCR" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
      },
    });

    if (!application) {
      return NextResponse.json({ status: "NONE" });
    }

    return NextResponse.json({
      id: application.id,
      status: application.status,
      reviewNote: application.reviewNote,
      reviewedAt: application.reviewedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("GET /api/dcr/application-status error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
