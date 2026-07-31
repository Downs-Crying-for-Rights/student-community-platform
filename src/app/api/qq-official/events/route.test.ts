import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  complete: vi.fn(),
  record: vi.fn(),
  release: vi.fn(),
  send: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  process: vi.fn(),
}));
vi.mock("@/lib/qq-bot-service", () => ({ processQQBotMessage: mocks.process }));

vi.mock("@/lib/qq-official", () => ({
  getQQOfficialConfig: mocks.config,
  completeQQOfficialEvent: mocks.complete,
  recordQQOfficialEvent: mocks.record,
  releaseQQOfficialEvent: mocks.release,
  sendQQOfficialReply: mocks.send,
  signQQOfficialChallenge: mocks.challenge,
  verifyQQOfficialSignature: mocks.verify,
}));

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://forum.example/api/qq-official/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bot-appid": "11111111",
      "x-signature-timestamp": "1725442341",
      "x-signature-ed25519": "a".repeat(128),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/qq-official/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue({ enabled: true, configured: true, appId: "11111111", clientSecret: "test-secret" });
    mocks.challenge.mockReturnValue("signed-challenge");
    mocks.verify.mockReturnValue(true);
    mocks.record.mockResolvedValue({ status: "ACQUIRED", leaseToken: "lease-1" });
    mocks.complete.mockResolvedValue(true);
    mocks.release.mockResolvedValue(undefined);
    mocks.send.mockResolvedValue(undefined);
    mocks.process.mockResolvedValue({
      duplicate: false,
      replies: ["可用命令：帮助、绑定、注册、状态、新建委托、取消、草稿。"],
      conversation: { state: "idle", revision: "1", prompt: null },
    });
    vi.spyOn(Date, "now").mockReturnValue(1_725_442_341_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers Tencent callback validation without requiring event headers", async () => {
    const { POST } = await import("./route");
    const response = await POST(request(
      { op: 13, d: { plain_token: "Arq0D5A61EgUu4OxUvOp", event_ts: "1725442341" } },
      { "x-signature-timestamp": "", "x-signature-ed25519": "" },
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plain_token: "Arq0D5A61EgUu4OxUvOp", signature: "signed-challenge" });
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("does not sign callback-shaped or stale unsigned challenges", async () => {
    const { POST } = await import("./route");
    const callbackShaped = await POST(request(
      { op: 13, d: { plain_token: '{"op":0,"t":"C2C_MESSAGE_CREATE"}', event_ts: "1725442341" } },
      { "x-signature-timestamp": "", "x-signature-ed25519": "" },
    ));
    expect(callbackShaped.status).toBe(401);
    const stale = await POST(request(
      { op: 13, d: { plain_token: "Arq0D5A61EgUu4OxUvOp", event_ts: "1725430000" } },
      { "x-signature-timestamp": "", "x-signature-ed25519": "" },
    ));
    expect(stale.status).toBe(401);
    expect(mocks.challenge).not.toHaveBeenCalled();
  });

  it("rejects an invalid event signature before processing", async () => {
    mocks.verify.mockReturnValue(false);
    const { POST } = await import("./route");
    const response = await POST(request({ op: 0, id: "event-1", t: "READY", d: {} }));
    expect(response.status).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without processing an event", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://forum.example/api/qq-official/events", {
      method: "POST",
      headers: {
        "x-bot-appid": "11111111",
        "x-signature-timestamp": "1725442341",
        "x-signature-ed25519": "a".repeat(128),
      },
      body: "{invalid",
    }));
    expect(response.status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("deduplicates and replies to a C2C message without storing its OpenID", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      op: 0,
      id: "event-1",
      t: "C2C_MESSAGE_CREATE",
      d: { id: "message-1", content: "帮助", author: { user_openid: "openid-1" } },
    }));
    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith("event-1");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "user", targetId: "openid-1", messageId: "message-1",
    }));
    expect(mocks.complete).toHaveBeenCalledWith("event-1", "C2C_MESSAGE_CREATE", "lease-1");
  });

  it("acks delivered duplicates but asks Tencent to retry in-progress events", async () => {
    const { POST } = await import("./route");
    const event = {
      op: 0,
      id: "event-1",
      t: "C2C_MESSAGE_CREATE",
      d: { id: "message-1", content: "帮助", author: { user_openid: "openid-1" } },
    };
    mocks.record.mockResolvedValueOnce({ status: "DELIVERED" });
    expect((await POST(request(event))).status).toBe(200);
    mocks.record.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    expect((await POST(request(event))).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("releases the deduplication key and rejects the callback when a reply fails", async () => {
    mocks.send.mockRejectedValue(new Error("provider unavailable"));
    const { POST } = await import("./route");
    const response = await POST(request({
      op: 0,
      id: "event-1",
      t: "GROUP_AT_MESSAGE_CREATE",
      d: { id: "message-1", content: "帮助", group_openid: "group-1", author: {} },
    }));
    expect(response.status).toBe(502);
    expect(mocks.release).toHaveBeenCalledWith("event-1", "lease-1");
  });
});
