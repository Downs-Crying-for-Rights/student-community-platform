import { NextResponse } from "next/server";
import { withTelemetry } from "@/lib/telemetry";
import { z } from "zod";
import {
  getQQOfficialConfig,
  signQQOfficialChallenge,
  verifyQQOfficialSignature,
} from "@/lib/qq-official";
import { processQQOfficialEvent, qqOfficialEventSchema } from "@/lib/qq-official-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validationSchema = z.object({
  op: z.literal(13),
  d: z.object({
    plain_token: z.string().regex(/^[A-Za-z0-9._-]{8,128}$/),
    event_ts: z.string().regex(/^\d{10,13}$/),
  }).strict(),
}).passthrough();

const post = async (req: Request) => {
  const config = getQQOfficialConfig();
  if (!config.enabled || !config.configured) {
    return NextResponse.json({ error: "机器人未启用" }, { status: 503 });
  }
  if (req.headers.get("x-bot-appid") !== config.appId) {
    return NextResponse.json({ error: "请求无效" }, { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 65_536) return NextResponse.json({ error: "请求过大" }, { status: 413 });
  const body = await req.text();
  if (Buffer.byteLength(body) > 65_536) return NextResponse.json({ error: "请求过大" }, { status: 413 });

  const signature = req.headers.get("x-signature-ed25519");
  const signatureTimestamp = req.headers.get("x-signature-timestamp");
  if (signature || signatureTimestamp) {
    const signatureValid = verifyQQOfficialSignature({
      secret: config.clientSecret,
      timestamp: signatureTimestamp ?? "",
      signature: signature ?? "",
      body,
    });
    if (!signatureValid) return NextResponse.json({ error: "签名无效" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  if (!signature && !signatureTimestamp) {
    const validation = validationSchema.safeParse(payload);
    if (!validation.success) return NextResponse.json({ error: "签名无效" }, { status: 401 });
    const timestampSeconds = Number(validation.data.d.event_ts.slice(0, 10));
    if (Math.abs(Math.floor(Date.now() / 1_000) - timestampSeconds) > 10 * 60) {
      return NextResponse.json({ error: "挑战已过期" }, { status: 401 });
    }
    return NextResponse.json({
      plain_token: validation.data.d.plain_token,
      signature: signQQOfficialChallenge(
        config.clientSecret,
        validation.data.d.event_ts,
        validation.data.d.plain_token,
      ),
    });
  }

  const event = qqOfficialEventSchema.safeParse(payload);
  if (!event.success) return NextResponse.json({ error: "事件格式无效" }, { status: 400 });
  const result = await processQQOfficialEvent(event.data);
  if (result.status === "INVALID") return NextResponse.json({ error: "消息格式无效" }, { status: 400 });
  if (result.status === "IN_PROGRESS") return NextResponse.json({ error: "事件处理中" }, { status: 409 });
  if (result.status === "REPLY_FAILED") return NextResponse.json({ error: "回复失败" }, { status: 502 });
  return NextResponse.json({ op: 12 });
};

export const POST = withTelemetry(post, { route: "/api/qq-official/events" });
