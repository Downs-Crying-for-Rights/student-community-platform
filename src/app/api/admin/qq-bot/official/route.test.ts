import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  config: vi.fn(),
  token: vi.fn(),
  lastEvent: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/qq-official", () => ({
  getQQOfficialConfig: mocks.config,
  getQQOfficialAccessToken: mocks.token,
  getQQOfficialLastEvent: mocks.lastEvent,
}));
vi.mock("@/lib/audit", () => ({
  AuditAction: { QQ_OFFICIAL_BOT_CONNECTION_TEST: "QQ_OFFICIAL_BOT_CONNECTION_TEST" },
  AuditTargetType: { SYSTEM: "SYSTEM" },
  logAudit: mocks.audit,
}));

function request(method = "GET", body?: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/qq-bot/official", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("/api/admin/qq-bot/official", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://forum.example/";
    mocks.config.mockReturnValue({
      enabled: true,
      configured: true,
      appId: "1905240046",
      clientSecret: "never-return-this",
    });
    mocks.lastEvent.mockResolvedValue(null);
    mocks.token.mockResolvedValue("access-token");
  });

  it("rejects non-super administrators", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    const { GET } = await import("./route");
    expect((await GET(request(), { params: {} })).status).toBe(403);
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("returns only masked configuration and the WebSocket mode", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root-1", role: "SUPER_ADMIN" } });
    const { GET } = await import("./route");
    const response = await GET(request(), { params: {} });
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("1905****46");
    expect(serialized).toContain('"connectionMode":"websocket"');
    expect(serialized).toContain("https://api.sgroup.qq.com/gateway/bot");
    expect(serialized).not.toContain("callbackUrl");
    expect(serialized).not.toContain("never-return-this");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("strictly validates and audits connection tests without recording credentials", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root-1", role: "SUPER_ADMIN" } });
    const { POST } = await import("./route");
    expect((await POST(request("POST", {
      action: "TEST_CONNECTION", confirmation: "CONFIRM", secret: "unexpected",
    }), { params: {} })).status).toBe(400);
    expect((await POST(request("POST", {
      action: "TEST_CONNECTION", confirmation: "CONFIRM",
    }), { params: {} })).status).toBe(200);
    expect(mocks.token).toHaveBeenCalledWith(true);
    expect(mocks.audit).toHaveBeenCalledWith(
      "root-1",
      "QQ_OFFICIAL_BOT_CONNECTION_TEST",
      "SYSTEM",
      "qq-official",
      { success: true },
    );
  });
});
