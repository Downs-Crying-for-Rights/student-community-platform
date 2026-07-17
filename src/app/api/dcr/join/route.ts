import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * 旧版自助加入入口已停用。DCR 权限只能由委托审核和管理员准入审核授予。
 */
export const POST = withAuth(async (_req: AuthenticatedRequest) => {
  return NextResponse.json(
    {
      error: "自助加入入口已停用，请完成手机号验证、入频考核并提交委托表等待审核",
      next: "/dcr",
    },
    { status: 410 },
  );
});
