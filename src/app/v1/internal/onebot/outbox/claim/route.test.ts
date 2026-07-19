import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), claim: vi.fn(), heartbeat: vi.fn() }));
vi.mock("@/lib/qq-outbox", () => ({
  authorizeQQInternalRequest: mocks.authorize,
  claimQQOutboxMessages: mocks.claim,
}));
vi.mock("@/lib/qq-bot-monitor", () => ({ recordQQBotHeartbeat: mocks.heartbeat }));

describe("POST /v1/internal/onebot/outbox/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QQ_BOT_EXPECTED_SELF_ID = "3917673573";
    mocks.authorize.mockReturnValue({ ok: true });
    mocks.claim.mockResolvedValue([]);
    mocks.heartbeat.mockResolvedValue(undefined);
  });

  it("records a heartbeat only after an authenticated worker successfully claims", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/v1/internal/onebot/outbox/claim", {
      method: "POST",
      body: JSON.stringify({ selfId: "3917673573", limit: 10 }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledWith(undefined, expect.any(Date), 10);
    expect(mocks.heartbeat).toHaveBeenCalledWith("3917673573", expect.any(Date));
  });

  it("does not record a heartbeat for the wrong bot identity", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/v1/internal/onebot/outbox/claim", {
      method: "POST",
      body: JSON.stringify({ selfId: "123456789", limit: 10 }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
});
