import { NextResponse } from "next/server";

import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { collectSystemMetrics } from "@/lib/system-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可查看服务器运行状态" }, { status: 403 });
  }
  try {
    return NextResponse.json(await collectSystemMetrics(), {
      headers: { "Cache-Control": "private, no-store, no-cache, max-age=0", Pragma: "no-cache" },
    });
  } catch (error) {
    console.error("GET /api/admin/system/metrics error:", error);
    return NextResponse.json({ error: "读取服务器运行状态失败" }, { status: 500 });
  }
}, "SUPER_ADMIN", { route: "/api/admin/system/metrics", persist: false });
