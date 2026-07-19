import { extractText, routeInput } from "./commands.js";
import type { InternalMessageRequest, MessageApi, OneBotAction, OneBotPrivateMessageEvent } from "./types.js";

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

export class EventProcessor {
  constructor(
    private readonly app: MessageApi,
    private readonly expectedSelfId: string,
    private readonly allowedUserIds: ReadonlySet<string>,
    private readonly maxMessageBytes: number,
  ) {}

  async process(value: unknown, send: (action: OneBotAction) => void): Promise<"ignored" | "processed" | "failed"> {
    // Group events and notices are intentionally rejected before any identifying details are read or forwarded.
    if (!isPrivateMessage(value)) return "ignored";
    if (String(value.self_id) !== this.expectedSelfId) return "ignored";
    if (!this.allowedUserIds.has(String(value.user_id))) return "ignored";

    const text = extractText(value.message, value.raw_message);
    if (!text || Buffer.byteLength(text, "utf8") > this.maxMessageBytes) return "ignored";

    const occurredAt = new Date(value.time * 1_000);
    if (!Number.isFinite(occurredAt.getTime())) return "ignored";

    const request: InternalMessageRequest = {
      version: 1,
      eventId: `${this.expectedSelfId}:${String(value.message_id)}`,
      platform: "onebot11",
      selfId: this.expectedSelfId,
      userId: String(value.user_id),
      occurredAt: occurredAt.toISOString(),
      input: routeInput(text),
    };

    try {
      const result = await this.app.processMessage(request);
      if (result.duplicate) return "processed";
      for (const reply of result.replies) {
        send({ action: "send_private_msg", params: { user_id: value.user_id, message: reply } });
      }
      return "processed";
    } catch {
      send({ action: "send_private_msg", params: { user_id: value.user_id, message: TEMPORARY_FAILURE_MESSAGE } });
      return "failed";
    }
  }
}
