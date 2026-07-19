import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), operation: vi.fn(), audit: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit", () => ({
  AuditAction: { QQ_BOT_CREDENTIAL_VIEW: "QQ_BOT_CREDENTIAL_VIEW" },
  AuditTargetType: { SYSTEM: "SYSTEM" },
  logAudit: mocks.audit,
}));
vi.mock("@/lib/qq-bot-operations", () => ({ getQQBotOperationResult: mocks.operation }));

describe("GET /api/admin/qq-bot/credentials", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does not expose credentials to regular administrators", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3000/api/admin/qq-bot/credentials"), { params: {} });
    expect(response.status).toBe(403);
    expect(mocks.operation).not.toHaveBeenCalled();
  });

  it("returns no-store credentials and audits the view", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root-1", role: "SUPER_ADMIN" } });
    mocks.operation.mockResolvedValue({
      commandId: "command-1", action: "REFRESH_LOGIN", status: "SUCCEEDED", updatedAt: "2026-07-19T12:00:00.000Z", message: "ok",
      login: { isLogin: false, isOffline: false, qrcode: "https://qq.example", captchaUrl: null, deviceVerificationUrl: null, loginError: null, smsSupported: false },
    });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3000/api/admin/qq-bot/credentials"), { params: {} });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.audit).toHaveBeenCalledWith("root-1", "QQ_BOT_CREDENTIAL_VIEW", "SYSTEM", "command-1", expect.any(Object));
  });
});
