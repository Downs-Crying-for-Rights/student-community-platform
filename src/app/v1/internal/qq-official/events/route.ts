import { NextResponse } from "next/server";
import { isValidInternalBearer } from "@/lib/qq-bot-contract";
import { getQQOfficialConfig } from "@/lib/qq-official";
import { processQQOfficialEvent } from "@/lib/qq-official-events";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const post = async (request: Request) => {
  if (!isValidInternalBearer(request.headers.get("authorization"), process.env.INTERNAL_API_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const config = getQQOfficialConfig();
  if (!config.enabled || !config.configured) {
    return NextResponse.json({ error: "QQ official bot is disabled" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 65_536) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const payload = await request.json().catch(() => null);
  const result = await processQQOfficialEvent(payload);
  const status = result.status === "INVALID" ? 400
    : result.status === "IN_PROGRESS" ? 409
      : result.status === "REPLY_FAILED" ? 502
        : 200;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
};

export const POST = withTelemetry(post, { route: "/v1/internal/qq-official/events" });
