import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * 倾诉匹配暂停期间不暴露等待队列。
 */
export const GET = withAuth(async (_req: AuthenticatedRequest) => {
  return NextResponse.json({ queue: [], paused: true });
});
