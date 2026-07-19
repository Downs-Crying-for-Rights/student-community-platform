import { NextResponse } from "next/server";
import { z } from "zod";

import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { enqueueQQBotOperation, QQ_BOT_OPERATION_ACTIONS } from "@/lib/qq-bot-operations";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(QQ_BOT_OPERATION_ACTIONS),
  confirmation: z.literal("CONFIRM"),
}).strict();

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "操作参数或确认无效" }, { status: 400 });

  const command = await enqueueQQBotOperation(parsed.data.action);
  if (!command) return NextResponse.json({ error: "已有机器人修复操作正在等待执行" }, { status: 409 });

  await logAudit(req.user.id, AuditAction.QQ_BOT_OPERATION_REQUEST, AuditTargetType.SYSTEM, command.id, {
    action: command.action,
    requestedAt: command.requestedAt,
  });
  return NextResponse.json({ success: true, command }, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}, "SUPER_ADMIN");
