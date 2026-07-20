import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeQQInternalRequest } from "@/lib/qq-outbox";
import {
  claimQQBotOperation,
  QQ_BOT_OPERATION_ACTIONS,
  recordQQBotOperationResult,
} from "@/lib/qq-bot-operations";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resultSchema = z.object({
  commandId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  action: z.enum(QQ_BOT_OPERATION_ACTIONS),
  status: z.enum(["SUCCEEDED", "FAILED"]),
  updatedAt: z.string().datetime({ offset: true }),
  message: z.string().max(500),
  login: z.object({
    isLogin: z.boolean(),
    isOffline: z.boolean(),
    qrcode: z.string().max(4096).nullable(),
    captchaUrl: z.string().url().max(4096).nullable(),
    deviceVerificationUrl: z.string().url().max(4096).nullable(),
    loginError: z.string().max(1000).nullable(),
    smsSupported: z.literal(false),
  }).strict().optional(),
}).strict();

function authorize(request: Request) {
  const result = authorizeQQInternalRequest(request);
  return result.ok ? null : NextResponse.json({ error: "Unauthorized" }, { status: result.status });
}

const get = async (request: Request) => {
  const denied = authorize(request);
  if (denied) return denied;
  return NextResponse.json({ command: await claimQQBotOperation() }, { headers: { "Cache-Control": "no-store" } });
};

const post = async (request: Request) => {
  const denied = authorize(request);
  if (denied) return denied;
  const parsed = resultSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  if (!await recordQQBotOperationResult(parsed.data)) {
    return NextResponse.json({ error: "Stale operation lease" }, { status: 409 });
  }
  return new NextResponse(null, { status: 204 });
};

export const GET = withTelemetry(get, { route: "/v1/internal/onebot/operations" });
export const POST = withTelemetry(post, { route: "/v1/internal/onebot/operations" });
