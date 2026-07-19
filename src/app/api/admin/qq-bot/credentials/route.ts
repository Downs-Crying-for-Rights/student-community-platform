import { NextResponse } from "next/server";

import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { getQQBotOperationResult } from "@/lib/qq-bot-operations";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const operation = await getQQBotOperationResult();
  if (!operation?.login) return NextResponse.json({ error: "没有可用的登录凭证，请先刷新" }, { status: 404 });

  await logAudit(req.user.id, AuditAction.QQ_BOT_CREDENTIAL_VIEW, AuditTargetType.SYSTEM, operation.commandId, {
    action: operation.action,
    viewedAt: new Date().toISOString(),
    credentialTypes: [
      operation.login.qrcode ? "qrcode" : null,
      operation.login.captchaUrl ? "captcha" : null,
      operation.login.deviceVerificationUrl ? "device" : null,
    ].filter(Boolean),
  });

  return NextResponse.json({ commandId: operation.commandId, login: operation.login }, {
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
}, "SUPER_ADMIN");
