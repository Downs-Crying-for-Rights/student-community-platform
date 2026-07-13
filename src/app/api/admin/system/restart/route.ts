import { rm } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function scheduleProcessRestart(delayMs = 1500): void {
  const timer = setTimeout(() => process.exit(0), delayMs);
  timer.unref();
}

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json().catch(() => null);
    if (body?.confirmation !== "RESTART") {
      return NextResponse.json({ error: "缺少重启确认" }, { status: 400 });
    }

    await logAudit(
      req.user.id,
      AuditAction.SYSTEM_RESTART,
      AuditTargetType.SYSTEM,
      "forum-dcr2026",
      { cacheScopes: ["redis", "next", "browser"], requestedAt: new Date().toISOString() },
    );

    await redis.flushdb();
    revalidatePath("/", "layout");
    await rm(path.join(process.cwd(), ".next", "cache"), {
      recursive: true,
      force: true,
    });

    if (process.env.NODE_ENV !== "test") {
      scheduleProcessRestart();
    }

    return NextResponse.json(
      {
        success: true,
        message: "缓存已清理，服务正在重启",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Clear-Site-Data": '"cache"',
        },
      },
    );
  } catch (error) {
    console.error("POST /api/admin/system/restart error:", error);
    return NextResponse.json(
      { error: "缓存清理或重启失败" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}, "SUPER_ADMIN");
