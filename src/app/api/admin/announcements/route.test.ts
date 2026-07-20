import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  scan: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ default: { $transaction: mocks.transaction } }));
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scan }));
vi.mock("@/lib/announcement-delivery", () => ({
  queueAnnouncementDeliveries: vi.fn(),
  processAnnouncementDeliveries: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  AuditAction: { ANNOUNCEMENT_CREATE: "ANNOUNCEMENT_CREATE", ANNOUNCEMENT_BROADCAST: "ANNOUNCEMENT_BROADCAST" },
  AuditTargetType: { ANNOUNCEMENT: "ANNOUNCEMENT" },
  logAudit: mocks.audit,
}));

const body = { title: "平台公告", content: "这是公告正文", forcePopup: true, sendDm: false };

describe("POST /api/admin/announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scan.mockResolvedValue([]);
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({ announcement: { create: mocks.create, updateMany: mocks.updateMany }, auditLog: {} }));
    mocks.create.mockResolvedValue({ id: "a1", ...body, revision: 1 });
  });

  it("requires SUPER_ADMIN", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/admin/announcements", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(403);
  });

  it("scans, creates, and audits a forced announcement", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/admin/announcements", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(201);
    expect(mocks.scan).toHaveBeenCalledWith("平台公告\n这是公告正文");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ forcePopup: true, createdById: "root" }) }));
    expect(mocks.audit).toHaveBeenCalledWith("root", "ANNOUNCEMENT_CREATE", "ANNOUNCEMENT", "a1", expect.any(Object), undefined, expect.any(Object));
  });
});
