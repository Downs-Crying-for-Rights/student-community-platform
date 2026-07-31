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

const GROUP_REPLY = "为保护账号与委托隐私，请私聊机器人使用：帮助、绑定、注册、状态、新建委托、取消、草稿。";

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
  const targetType = event.data.t === "C2C_MESSAGE_CREATE" ? "user" : "group";
  const targetId = targetType === "user" ? author?.user_openid : event.data.d.group_openid;
  if (!messageId || !content || content.length > 10_000 || typeof targetId !== "string" || targetId.length > 256) {
    return { status: "INVALID" };
  }
  const input = targetType === "user" ? routeQQBotInput(content) : null;
  if (targetType === "user" && !input) return { status: "INVALID" };

  const reservation = await recordQQOfficialEvent(event.data.id);
  if (reservation.status === "DELIVERED") return { status: "DUPLICATE" };
  if (reservation.status === "IN_PROGRESS") return { status: "IN_PROGRESS" };

  try {
    let reply = GROUP_REPLY;
    if (targetType === "user" && input) {
      const config = getQQOfficialConfig();
      const result = await processQQBotMessage({
        version: 1,
        eventId: `${config.appId}:official:${event.data.id}`,
        platform: "qq_official",
        selfId: config.appId,
        userId: targetId,
        occurredAt: occurredAt(event.data.d.timestamp),
        input,
      });
      reply = result.replies.join("\n\n") || "操作已完成。";
    }
    await sendQQOfficialReply({ targetType, targetId, messageId, content: reply });
  } catch {
    await releaseQQOfficialEvent(event.data.id, reservation.leaseToken).catch(() => null);
    return { status: "REPLY_FAILED" };
  }

  await completeQQOfficialEvent(event.data.id, event.data.t, reservation.leaseToken).catch(() => false);
  return { status: "DELIVERED" };
}
