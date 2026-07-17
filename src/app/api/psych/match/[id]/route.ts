import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * 倾诉匹配暂停期间不允许领取请求。
 */
export const POST = withAuth(async (
  _req: AuthenticatedRequest,
  _context: { params: Record<string, string> },
) => {
  return NextResponse.json(
    { error: "倾诉匹配功能暂时关闭", next: "/psych#resources" },
    { status: 503 },
  );
});
