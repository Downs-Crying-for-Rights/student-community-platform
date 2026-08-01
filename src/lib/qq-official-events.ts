import { z } from "zod";
import {
  completeQQOfficialEvent,
  getQQOfficialConfig,
  recordQQOfficialEvent,
  releaseQQOfficialEvent,
  sendQQOfficialReply,
} from "@/lib/qq-official";
import { routeQQBotInput } from "@/lib/qq-bot-contract";
import { processQQBotMessage } from "@/lib/qq-bot-service";

export const qqOfficialEventSchema = z.object({
  id: z.string().min(1).max(512),
  op: z.literal(0),
  t: z.string().min(1).max(128),
  d: z.record(z.string(), z.unknown()),
}).passthrough();

const QQ_OFFICIAL_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const GROUP_MENTION_PATTERN = /<@![^>]*>/gu;

function occurredAt(value: unknown): string {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

export type QQOfficialEventResult =
  | { status: "IGNORED" | "DELIVERED" | "DUPLICATE" }
  | { status: "IN_PROGRESS" }
  | { status: "INVALID" }
  | { status: "REPLY_FAILED" };

export async function processQQOfficialEvent(payload: unknown): Promise<QQOfficialEventResult> {
  const event = qqOfficialEventSchema.safeParse(payload);
  if (!event.success) return { status: "INVALID" };
  if (event.data.t !== "C2C_MESSAGE_CREATE" && event.data.t !== "GROUP_AT_MESSAGE_CREATE") {
    return { status: "IGNORED" };
  }

  const messageId = typeof event.data.d.id === "string" ? event.data.d.id : "";
  const content = typeof event.data.d.content === "string" ? event.data.d.content.trim() : "";
  const author = event.data.d.author as Record<string, unknown> | undefined;
  const isGroup = event.data.t === "GROUP_AT_MESSAGE_CREATE";
  const targetType = isGroup ? "group" : "user";
  const targetId = isGroup ? event.data.d.group_openid : author?.user_openid;
  if (!messageId || !content || content.length > 10_000
    || typeof targetId !== "string" || !QQ_OFFICIAL_ID_PATTERN.test(targetId)) {
    return { status: "INVALID" };
  }
  const stripped = isGroup ? content.replace(GROUP_MENTION_PATTERN, "").trim() : content;
  const input = isGroup
    ? (stripped ? { type: "text" as const, text: stripped } : null)
    : routeQQBotInput(stripped);
  if (!input) return { status: "INVALID" };

  const reservation = await recordQQOfficialEvent(event.data.id);
  if (reservation.status === "DELIVERED") return { status: "DUPLICATE" };
  if (reservation.status === "IN_PROGRESS") return { status: "IN_PROGRESS" };

  try {
    const config = getQQOfficialConfig();
    const result = await processQQBotMessage({
      version: 1,
      eventId: `${config.appId}:official:${event.data.id}`,
      platform: "qq_official",
      selfId: config.appId,
      userId: targetId,
      occurredAt: occurredAt(event.data.d.timestamp),
      conversation: isGroup ? { type: "group", groupId: targetId } : { type: "private" },
      input,
    });
    const reply = result.replies.join("\n\n") || "操作已完成。";
    await sendQQOfficialReply({ targetType, targetId, messageId, content: reply });
  } catch {
    await releaseQQOfficialEvent(event.data.id, reservation.leaseToken).catch(() => null);
    return { status: "REPLY_FAILED" };
  }

  await completeQQOfficialEvent(event.data.id, event.data.t, reservation.leaseToken).catch(() => false);
  return { status: "DELIVERED" };
}
