import { extractMentionedText, extractText, routeInput } from "./commands.js";
import type { InternalMessageRequest, MessageApi, OneBotAction, OneBotGroupMessageEvent, OneBotPrivateMessageEvent } from "./types.js";

const TEMPORARY_FAILURE_MESSAGE = "服务暂时不可用，请稍后重试。";

function isPrivateMessage(value: unknown): value is OneBotPrivateMessageEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<OneBotPrivateMessageEvent>;
  return (
    event.post_type === "message" &&
    event.message_type === "private" &&
    (typeof event.self_id === "string" || typeof event.self_id === "number") &&
    (typeof event.user_id === "string" || typeof event.user_id === "number") &&
    (typeof event.message_id === "string" || typeof event.message_id === "number") &&
    typeof event.time === "number" &&
    Number.isFinite(event.time)
  );
}

function isGroupMessage(value: unknown): value is OneBotGroupMessageEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<OneBotGroupMessageEvent>;
  return (
    event.post_type === "message" &&
    event.message_type === "group" &&
    (typeof event.self_id === "string" || typeof event.self_id === "number") &&
    (typeof event.user_id === "string" || typeof event.user_id === "number") &&
    (typeof event.group_id === "string" || typeof event.group_id === "number") &&
    (typeof event.message_id === "string" || typeof event.message_id === "number") &&
    typeof event.time === "number" && Number.isFinite(event.time)
  );
}

export class EventProcessor {
  constructor(
    private readonly app: MessageApi,
    private readonly expectedSelfId: string,
    private readonly maxMessageBytes: number,
  ) {}

  async process(value: unknown, send: (action: OneBotAction) => void): Promise<"ignored" | "processed" | "failed"> {
    if (!isPrivateMessage(value) && !isGroupMessage(value)) return "ignored";
    if (String(value.self_id) !== this.expectedSelfId) return "ignored";

    const isGroup = value.message_type === "group";
    const text = isGroup
      ? extractMentionedText(value.message, this.expectedSelfId, value.raw_message)
      : extractText(value.message, value.raw_message);
    if (!text || Buffer.byteLength(text, "utf8") > this.maxMessageBytes) return "ignored";
    const input = isGroup ? { type: "text" as const, text } : routeInput(text);

    const occurredAt = new Date(value.time * 1_000);
    if (!Number.isFinite(occurredAt.getTime())) return "ignored";

    const request: InternalMessageRequest = {
      version: 1,
      eventId: isGroup
        ? `${this.expectedSelfId}:group:${String(value.group_id)}:${String(value.message_id)}`
        : `${this.expectedSelfId}:${String(value.message_id)}`,
      platform: "onebot11",
      selfId: this.expectedSelfId,
      userId: String(value.user_id),
      occurredAt: occurredAt.toISOString(),
      conversation: isGroup
        ? { type: "group", groupId: String(value.group_id) }
        : { type: "private" },
      input,
    };

    try {
      const result = await this.app.processMessage(request);
      if (result.duplicate) return "processed";
      for (const reply of result.replies) {
        send(isGroup
          ? { action: "send_group_msg", params: { group_id: value.group_id, message: reply } }
          : { action: "send_private_msg", params: { user_id: value.user_id, message: reply } });
      }
      return "processed";
    } catch {
      send(isGroup
        ? { action: "send_group_msg", params: { group_id: value.group_id, message: TEMPORARY_FAILURE_MESSAGE } }
        : { action: "send_private_msg", params: { user_id: value.user_id, message: TEMPORARY_FAILURE_MESSAGE } });
      return "failed";
    }
  }
}
