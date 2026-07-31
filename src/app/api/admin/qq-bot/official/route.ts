import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import {
  getQQOfficialAccessToken,
  getQQOfficialConfig,
  getQQOfficialLastEvent,
} from "@/lib/qq-official";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.literal("TEST_CONNECTION"),
  confirmation: z.literal("CONFIRM"),
}).strict();

export const GET = withAuth(async () => {
  const config = getQQOfficialConfig();
  return NextResponse.json({
    enabled: config.enabled,
    configured: config.configured,
    appId: config.appId ? `${config.appId.slice(0, 4)}****${config.appId.slice(-2)}` : null,
    connectionMode: "websocket",
    gatewayEndpoint: "https://api.sgroup.qq.com/gateway/bot",
    lastEvent: await getQQOfficialLastEvent(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}, "SUPER_ADMIN");

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = actionSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "操作参数或确认无效" }, { status: 400 });
  }

  try {
    await getQQOfficialAccessToken(true);
  } catch {
    await logAudit(req.user.id, AuditAction.QQ_OFFICIAL_BOT_CONNECTION_TEST, AuditTargetType.SYSTEM, "qq-official", {
      success: false,
    });
    return NextResponse.json({ error: "腾讯鉴权失败，请检查服务器凭据" }, { status: 502 });
  }
  await logAudit(req.user.id, AuditAction.QQ_OFFICIAL_BOT_CONNECTION_TEST, AuditTargetType.SYSTEM, "qq-official", {
    success: true,
  });
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
}, "SUPER_ADMIN");
