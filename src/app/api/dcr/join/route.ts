import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";

/**
 * POST /api/dcr/join
 * Join the DCR mutual aid team.
 * - Requires quizPassed=true, otherwise 403
 * - If dcrAccess already true, returns 409
 * - Sets dcrAccess=true and logs audit
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { quizPassed: true, dcrAccess: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (!user.quizPassed) {
      return NextResponse.json({ error: "请先完成考核" }, { status: 403 });
    }

    if (user.dcrAccess) {
      return NextResponse.json({ error: "已加入互助队伍" }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { dcrAccess: true },
    });

    await logAudit(
      userId,
      AuditAction.DCR_ACCESS_GRANT,
      AuditTargetType.USER,
      userId,
      { action: "join_mutual_aid" },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/dcr/join error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
