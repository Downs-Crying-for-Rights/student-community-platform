import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ claim: vi.fn(), record: vi.fn() }));
vi.mock("@/lib/qq-bot-operations", () => ({
  QQ_BOT_OPERATION_ACTIONS: ["RESTART_WORKER", "RESTART_NAPCAT", "REFRESH_LOGIN"],
  claimQQBotOperation: mocks.claim,
  recordQQBotOperationResult: mocks.record,
}));

function request(method: "GET" | "POST", body?: unknown, token = "internal-secret") {
  return new Request("http://localhost:3000/v1/internal/onebot/operations", {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("internal QQ bot operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_TOKEN = "internal-secret";
    process.env.QQ_BOT_ENABLED = "true";
    process.env.QQ_BOT_EXPECTED_SELF_ID = "3917673573";
    mocks.record.mockResolvedValue(true);
  });

  it("rejects an invalid internal token without claiming commands", async () => {
    const { GET } = await import("./route");
    expect((await GET(request("GET", undefined, "wrong"))).status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("claims one operation and accepts a constrained result", async () => {
    const command = { id: "f9c74a69-3b0f-4a13-b961-166aae661234", leaseToken: "f8a0a6ca-40e5-41c7-a829-055cf8eaa632", action: "REFRESH_LOGIN", requestedAt: "2026-07-19T12:00:00.000Z" };
    mocks.claim.mockResolvedValue(command);
    const { GET, POST } = await import("./route");
    expect(await (await GET(request("GET"))).json()).toEqual({ command });

    const result = {
      commandId: command.id,
      leaseToken: command.leaseToken,
      action: command.action,
      status: "SUCCEEDED",
      updatedAt: "2026-07-19T12:00:01.000Z",
      message: "refreshed",
      login: {
        isLogin: false, isOffline: false, qrcode: "https://qq.example/login",
        captchaUrl: null, deviceVerificationUrl: null, loginError: null, smsSupported: false,
      },
    };
    expect((await POST(request("POST", result))).status).toBe(204);
    expect(mocks.record).toHaveBeenCalledWith(result);
  });

  it("rejects unsupported result fields", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("POST", {
      commandId: "f9c74a69-3b0f-4a13-b961-166aae661234",
      leaseToken: "f8a0a6ca-40e5-41c7-a829-055cf8eaa632",
      action: "RUN_SHELL",
      status: "SUCCEEDED",
      updatedAt: "2026-07-19T12:00:01.000Z",
      message: "bad",
    }));
    expect(response.status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
