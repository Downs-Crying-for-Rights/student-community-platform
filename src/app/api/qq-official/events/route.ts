import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getQQOfficialConfig,
  completeQQOfficialEvent,
  recordQQOfficialEvent,
  releaseQQOfficialEvent,
  sendQQOfficialReply,
  signQQOfficialChallenge,
  verifyQQOfficialSignature,
} from "@/lib/qq-official";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validationSchema = z.object({
  op: z.literal(13),
  d: z.object({
    plain_token: z.string().regex(/^[A-Za-z0-9._-]{8,128}$/),
    event_ts: z.string().regex(/^\d{10,13}$/),
  }).strict(),
}).passthrough();

const eventSchema = z.object({
  id: z.string().min(1).max(512),
  op: z.literal(0),
  t: z.string().min(1).max(128),
  d: z.record(z.string(), z.unknown()),
}).passthrough();

const replyText = "学互会 QQ 官方机器人已接入。当前支持基础消息回复；账号绑定、委托提交等敏感操作请在学互会网站完成。";

export async function POST(req: Request) {
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

  const event = eventSchema.safeParse(payload);
  if (!event.success) return NextResponse.json({ error: "事件格式无效" }, { status: 400 });
  if (event.data.t !== "C2C_MESSAGE_CREATE" && event.data.t !== "GROUP_AT_MESSAGE_CREATE") {
    return NextResponse.json({ op: 12 });
  }

  const messageId = typeof event.data.d.id === "string" ? event.data.d.id : "";
  const author = event.data.d.author as Record<string, unknown> | undefined;
  const targetType = event.data.t === "C2C_MESSAGE_CREATE" ? "user" : "group";
  const targetId = targetType === "user"
    ? author?.user_openid
    : event.data.d.group_openid;
  if (!messageId || typeof targetId !== "string" || targetId.length > 256) {
    return NextResponse.json({ error: "消息格式无效" }, { status: 400 });
  }

  const reservation = await recordQQOfficialEvent(event.data.id);
  if (reservation.status === "DELIVERED") return NextResponse.json({ op: 12 });
  if (reservation.status === "IN_PROGRESS") {
    return NextResponse.json({ error: "事件处理中" }, { status: 409 });
  }
  const leaseToken = reservation.leaseToken;
  try {
    await sendQQOfficialReply({ targetType, targetId, messageId, content: replyText });
  } catch {
    await releaseQQOfficialEvent(event.data.id, leaseToken).catch(() => null);
    return NextResponse.json({ error: "回复失败" }, { status: 502 });
  }
  // Delivery succeeded. If Redis completion is uncertain, ACK instead of risking a duplicate reply.
  await completeQQOfficialEvent(event.data.id, event.data.t, leaseToken).catch(() => false);
  return NextResponse.json({ op: 12 });
}
