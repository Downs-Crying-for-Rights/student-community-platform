import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), findUnique: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn(), scan: vi.fn(), history: vi.fn(), mail: vi.fn(),
}));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ default: { post: { findUnique: mocks.findUnique }, $transaction: mocks.transaction } }));
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scan }));
vi.mock("@/lib/mail", () => ({ sendAdminActionMail: mocks.mail }));
vi.mock("@/lib/audit", () => ({
  AuditAction: { POST_PIN_UPDATE: "POST_PIN_UPDATE", ADMIN_POST_CORRECT: "ADMIN_POST_CORRECT" },
  AuditTargetType: { POST: "POST" },
  logAudit: mocks.audit,
}));

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/posts/p1", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/posts/[id] pinning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id: "p1", status: "PUBLISHED", title: "帖子", content: "内容", isPinned: false });
    mocks.update.mockResolvedValue({ id: "p1", title: "帖子", isPinned: true });
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({
      post: { update: mocks.update }, postEditHistory: { create: mocks.history }, auditLog: {},
    }));
  });

  it("rejects moderators", async () => {
    mocks.session.mockResolvedValue({ user: { id: "mod", role: "MODERATOR" } });
    const { PATCH } = await import("./route");
    expect((await PATCH(request({ isPinned: true, reason: "重要内容" }), { params: { id: "p1" } })).status).toBe(403);
  });

  it("pins published posts and records an audit", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ isPinned: true, reason: "重要内容" }), { params: { id: "p1" } });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isPinned: true, pinnedAt: expect.any(Date) }) }));
    expect(mocks.audit).toHaveBeenCalledWith("admin", "POST_PIN_UPDATE", "POST", "p1", expect.objectContaining({ oldPinned: false, newPinned: true }), undefined, expect.any(Object));
  });

  it("does not pin non-published posts", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    mocks.findUnique.mockResolvedValue({ id: "p1", status: "PENDING", title: "帖子", content: "内容", isPinned: false });
    const { PATCH } = await import("./route");
    expect((await PATCH(request({ isPinned: true, reason: "重要内容" }), { params: { id: "p1" } })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
