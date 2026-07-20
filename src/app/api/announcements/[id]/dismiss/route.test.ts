import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: {
    announcement: { findUnique: mocks.findUnique },
    announcementReceipt: { upsert: mocks.upsert },
  },
}));

function request(revision: number) {
  return new NextRequest("http://localhost/api/announcements/a1/dismiss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision }),
  });
}

describe("POST /api/announcements/[id]/dismiss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", role: "USER", isBanned: false } });
    mocks.findUnique.mockResolvedValue({ id: "a1", revision: 3, isPublished: true, forcePopup: true });
  });

  it("rejects stale revisions", async () => {
    const { POST } = await import("./route");
    const response = await POST(request(2), { params: { id: "a1" } });
    expect(response.status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stores an idempotent per-user revision receipt", async () => {
    const { POST } = await import("./route");
    const response = await POST(request(3), { params: { id: "a1" } });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { announcementId_revision_userId: { announcementId: "a1", revision: 3, userId: "user-1" } },
      create: { announcementId: "a1", revision: 3, userId: "user-1" },
    }));
  });
});
