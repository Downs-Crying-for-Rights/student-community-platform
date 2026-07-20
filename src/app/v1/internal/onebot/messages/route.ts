import { NextResponse } from "next/server";
import { isValidInternalBearer, qqBotMessageSchema } from "@/lib/qq-bot-contract";
import { processQQBotMessage } from "@/lib/qq-bot-service";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enabled(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

const post = async (request: Request): Promise<NextResponse> => {
  if (!isValidInternalBearer(request.headers.get("authorization"), process.env.INTERNAL_API_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!enabled(process.env.QQ_BOT_ENABLED)) {
    return NextResponse.json({ error: "QQ bot is disabled" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = qqBotMessageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid contract" }, { status: 400 });

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey !== parsed.data.eventId) {
    return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
  }
  if (!process.env.QQ_BOT_EXPECTED_SELF_ID || parsed.data.selfId !== process.env.QQ_BOT_EXPECTED_SELF_ID) {
    return NextResponse.json({ error: "Unexpected bot identity" }, { status: 403 });
  }

  try {
    return NextResponse.json(await processQQBotMessage(parsed.data));
  } catch {
    return NextResponse.json({ error: "Temporary failure" }, { status: 500 });
  }
};

export const POST = withTelemetry(post, { route: "/v1/internal/onebot/messages" });
