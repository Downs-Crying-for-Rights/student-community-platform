import { beforeEach, describe, expect, it, vi } from "vitest";

const processMessage = vi.fn();
vi.mock("@/lib/qq-bot-service", () => ({
  processQQBotMessage: (...args: unknown[]) => processMessage(...args),
}));

const message = {
  version: 1,
  eventId: "1000000000:123",
  platform: "onebot11",
  selfId: "1000000000",
  userId: "2000000000",
  occurredAt: "2026-07-19T10:00:00.000Z",
  input: { type: "command", command: "帮助" },
};

function request(overrides: { token?: string; body?: unknown; selfId?: string; idempotencyKey?: string } = {}): Request {
  const body = { ...message, selfId: overrides.selfId ?? message.selfId, ...(overrides.body as object | undefined) };
  return new Request("http://localhost/v1/internal/onebot/messages", {
    method: "POST",
    headers: {
      authorization: `Bearer ${overrides.token ?? "secret"}`,
      "content-type": "application/json",
      "idempotency-key": overrides.idempotencyKey ?? body.eventId,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /v1/internal/onebot/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_TOKEN = "secret";
    process.env.QQ_BOT_EXPECTED_SELF_ID = "1000000000";
    process.env.QQ_BOT_ENABLED = "true";
    processMessage.mockResolvedValue({
      duplicate: false,
      replies: ["help"],
      conversation: { state: "idle", revision: "1", prompt: null },
    });
  });

  it("authenticates before reading an invalid body", async () => {
    const { POST } = await import("./route");
    const unauthorized = new Request("http://localhost/v1/internal/onebot/messages", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body: "not-json",
    });
    expect((await POST(unauthorized)).status).toBe(401);
  });

  it("enforces the enabled gate, self identity, and idempotency key", async () => {
    const { POST } = await import("./route");
    process.env.QQ_BOT_ENABLED = "false";
    expect((await POST(request())).status).toBe(503);
    process.env.QQ_BOT_ENABLED = "true";
    expect((await POST(request({ selfId: "3000000000", body: { eventId: "3000000000:123" }, idempotencyKey: "3000000000:123" }))).status).toBe(403);
    expect((await POST(request({ idempotencyKey: "1000000000:other" }))).status).toBe(400);
  });

  it("passes a strict valid request to the service", async () => {
    const { POST } = await import("./route");
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(processMessage).toHaveBeenCalledWith(message);
    expect(await result.json()).toMatchObject({ duplicate: false, replies: ["help"] });
  });
});
