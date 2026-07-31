import { z } from "zod";
import {
  completeQQOfficialEvent,
  recordQQOfficialEvent,
  releaseQQOfficialEvent,
  sendQQOfficialReply,
} from "@/lib/qq-official";

export const qqOfficialEventSchema = z.object({
  id: z.string().min(1).max(512),
  op: z.literal(0),
  t: z.string().min(1).max(128),
  d: z.record(z.string(), z.unknown()),
}).passthrough();

const replyText = "学互会 QQ 官方机器人已接入。当前支持基础消息回复；账号绑定、委托提交等敏感操作请在学互会网站完成。";

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
  const author = event.data.d.author as Record<string, unknown> | undefined;
  const targetType = event.data.t === "C2C_MESSAGE_CREATE" ? "user" : "group";
  const targetId = targetType === "user" ? author?.user_openid : event.data.d.group_openid;
  if (!messageId || typeof targetId !== "string" || targetId.length > 256) {
    return { status: "INVALID" };
  }

  const reservation = await recordQQOfficialEvent(event.data.id);
  if (reservation.status === "DELIVERED") return { status: "DUPLICATE" };
  if (reservation.status === "IN_PROGRESS") return { status: "IN_PROGRESS" };

  try {
    await sendQQOfficialReply({ targetType, targetId, messageId, content: replyText });
  } catch {
    await releaseQQOfficialEvent(event.data.id, reservation.leaseToken).catch(() => null);
    return { status: "REPLY_FAILED" };
  }

  await completeQQOfficialEvent(event.data.id, event.data.t, reservation.leaseToken).catch(() => false);
  return { status: "DELIVERED" };
}
