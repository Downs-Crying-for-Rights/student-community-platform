import type {
  AppApi,
  InternalMessageRequest,
  InternalMessageResponse,
  OutboxAck,
  OutboxItem,
} from "./types.js";

export class AppApiError extends Error {
  constructor(public readonly reason: "network" | "status" | "contract") {
    super(`Internal API ${reason} error`);
  }
}

function isResponse(value: unknown): value is InternalMessageResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<InternalMessageResponse>;
  const conversation = item.conversation as Partial<InternalMessageResponse["conversation"]> | undefined;
  return (
    typeof item.duplicate === "boolean" &&
    Array.isArray(item.replies) &&
    item.replies.length <= 10 &&
    item.replies.every((reply) => typeof reply === "string") &&
    !!conversation &&
    ["idle", "binding", "delegation_form", "draft"].includes(conversation.state ?? "") &&
    typeof conversation.revision === "string" &&
    conversation.revision.length > 0 &&
    (conversation.prompt === null || typeof conversation.prompt === "string")
  );
}

function isOutboxItems(value: unknown, maxMessageBytes: number): value is OutboxItem[] {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<OutboxItem>;
      return (
        typeof candidate.id === "string" &&
        candidate.id.length > 0 &&
        typeof candidate.userId === "string" &&
        candidate.userId.length > 0 &&
        typeof candidate.content === "string" &&
        candidate.content.length > 0 &&
        Buffer.byteLength(candidate.content, "utf8") <= maxMessageBytes
      );
    })
  );
}

export class AppClient implements AppApi {
  private readonly internalBaseUrl: URL;
  private readonly messageEndpoint: URL;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly maxMessageBytes: number,
  ) {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.internalBaseUrl = new URL("v1/internal/onebot/", normalizedBaseUrl);
    this.messageEndpoint = new URL("messages", this.internalBaseUrl);
  }

  async processMessage(request: InternalMessageRequest): Promise<InternalMessageResponse> {
    const body = JSON.stringify(request);
    if (Buffer.byteLength(body, "utf8") > this.maxMessageBytes) throw new AppApiError("contract");
    let response: Response;
    try {
      response = await fetch(this.messageEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
          "idempotency-key": request.eventId,
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AppApiError("network");
    }

    if (!response.ok) throw new AppApiError("status");
    const responseText = await response.text();
    if (Buffer.byteLength(responseText, "utf8") > this.maxMessageBytes) throw new AppApiError("contract");

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new AppApiError("contract");
    }
    if (!isResponse(parsed)) throw new AppApiError("contract");
    if (parsed.replies.some((reply) => Buffer.byteLength(reply, "utf8") > this.maxMessageBytes)) {
      throw new AppApiError("contract");
    }
    return parsed;
  }

  async claimOutbox(selfId: string): Promise<OutboxItem[]> {
    const parsed = await this.postJson(new URL("outbox/claim", this.internalBaseUrl), {
      selfId,
      limit: 10,
    });
    if (!isOutboxItems(parsed, this.maxMessageBytes)) throw new AppApiError("contract");
    return parsed;
  }

  async ackOutbox(id: string, ack: OutboxAck): Promise<void> {
    const encodedId = encodeURIComponent(id);
    await this.postJson(new URL(`outbox/${encodedId}/ack`, this.internalBaseUrl), ack, true);
  }

  private async postJson(endpoint: URL, value: unknown, allowEmpty = false): Promise<unknown> {
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body, "utf8") > this.maxMessageBytes) throw new AppApiError("contract");
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AppApiError("network");
    }
    if (!response.ok) throw new AppApiError("status");
    const responseText = await response.text();
    if (Buffer.byteLength(responseText, "utf8") > this.maxMessageBytes) throw new AppApiError("contract");
    if (!responseText && allowEmpty) return null;
    try {
      return JSON.parse(responseText);
    } catch {
      throw new AppApiError("contract");
    }
  }
}
