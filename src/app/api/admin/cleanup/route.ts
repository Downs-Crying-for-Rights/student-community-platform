import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { runAllCleanup } from "@/lib/cleanup";

/**
 * POST /api/admin/cleanup
 * Admin-only endpoint to trigger all data cleanup tasks.
 * Returns a report of what was cleaned.
 */
export const POST = withAuth(async (_req: AuthenticatedRequest) => {
  try {
    const report = await runAllCleanup();

    return NextResponse.json({
      message: "数据清理完成",
      report,
    });
  } catch {
    return NextResponse.json(
      { error: "数据清理执行失败" },
      { status: 500 },
    );
  }
}, "ADMIN");
