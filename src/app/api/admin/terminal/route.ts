import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import {
  isTerminalLogSource,
  readTerminalLog,
  TERMINAL_LOG_SOURCES,
} from "@/lib/terminal-logs";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可查看服务器终端日志" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") || "services";
  const rawLines = Number(searchParams.get("lines") || "500");

  if (!isTerminalLogSource(source) || !Number.isInteger(rawLines)) {
    return NextResponse.json({ error: "日志来源或行数无效" }, { status: 400 });
  }

  try {
    const result = await readTerminalLog(source, rawLines);
    return NextResponse.json(
      {
        source,
        label: TERMINAL_LOG_SOURCES[source].label,
        ...result,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("GET /api/admin/terminal error:", error);
    return NextResponse.json({ error: "读取服务器日志失败" }, { status: 500 });
  }
}, "SUPER_ADMIN", { route: "/api/admin/terminal", persist: false });
