import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), enqueue: vi.fn(), audit: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit", () => ({
  AuditAction: { QQ_BOT_OPERATION_REQUEST: "QQ_BOT_OPERATION_REQUEST" },
  AuditTargetType: { SYSTEM: "SYSTEM" },
  logAudit: mocks.audit,
}));
vi.mock("@/lib/qq-bot-operations", () => ({
  QQ_BOT_OPERATION_ACTIONS: ["RESTART_WORKER", "RESTART_NAPCAT", "REFRESH_LOGIN"],
  enqueueQQBotOperation: mocks.enqueue,
}));

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/qq-bot/actions", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/admin/qq-bot/actions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("only permits super administrators", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    const { POST } = await import("./route");
    const response = await POST(request({ action: "RESTART_WORKER", confirmation: "CONFIRM" }), { params: {} });
    expect(response.status).toBe(403);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("requires confirmation and audits an accepted operation", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root-1", role: "SUPER_ADMIN" } });
    const { POST } = await import("./route");
    expect((await POST(request({ action: "RESTART_WORKER" }), { params: {} })).status).toBe(400);
    mocks.enqueue.mockResolvedValue({ id: "command-1", action: "RESTART_WORKER", requestedAt: "2026-07-19T12:00:00.000Z" });
    expect((await POST(request({ action: "RESTART_WORKER", confirmation: "CONFIRM" }), { params: {} })).status).toBe(202);
    expect(mocks.audit).toHaveBeenCalledWith("root-1", "QQ_BOT_OPERATION_REQUEST", "SYSTEM", "command-1", expect.any(Object));
  });
});
