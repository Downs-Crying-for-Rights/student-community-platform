import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * 倾诉匹配在安全与隐私流程完善期间暂停，不再创建新的匹配请求。
 */
export const POST = withAuth(async (_req: AuthenticatedRequest) => {
  return NextResponse.json(
    {
      error: "倾诉匹配功能暂时关闭，请使用页面提供的专业求助资源",
      next: "/psych#resources",
    },
    { status: 503 },
  );
});
