import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findFirst: vi.fn(),
  findReceipt: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: {
    announcement: { findFirst: mocks.findFirst },
    announcementReceipt: { findUnique: mocks.findReceipt },
  },
}));

describe("GET /api/announcements/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: "announcement-1",
      title: "重要公告",
      content: "请阅读公告内容",
      revision: 2,
      publishedAt: new Date(),
    });
    mocks.findReceipt.mockResolvedValue(null);
  });

  it("allows anonymous visitors and returns the current forced announcement", async () => {
    mocks.session.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/announcements/current"), { params: {} });

    expect(response.status).toBe(200);
    expect((await response.json()).announcement).toMatchObject({ id: "announcement-1", revision: 2 });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.findReceipt).not.toHaveBeenCalled();
  });

  it("suppresses a revision already dismissed by the signed-in user", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-1", role: "USER", isBanned: false } });
    mocks.findReceipt.mockResolvedValue({ id: "receipt-1" });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/announcements/current"), { params: {} });

    expect(await response.json()).toEqual({ announcement: null });
    expect(mocks.findReceipt).toHaveBeenCalledWith(expect.objectContaining({
      where: { announcementId_revision_userId: { announcementId: "announcement-1", revision: 2, userId: "user-1" } },
    }));
  });
});
