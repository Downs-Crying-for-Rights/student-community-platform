import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: { systemConfig: { findUnique: mocks.findUnique, upsert: mocks.upsert } },
}));
vi.mock("@/lib/audit", () => ({
  AuditAction: { SITE_CONTENT_UPDATE: "SITE_CONTENT_UPDATE" },
  AuditTargetType: { SYSTEM: "SYSTEM" },
  logAudit: mocks.audit,
}));

const url = "http://localhost/api/admin/home-content";
const validHero = {
  title: "首页标题",
  description: "首页说明",
  links: [
    { label: "按钮一", href: "/kb" },
    { label: "按钮二", href: "/discover" },
    { label: "按钮三", href: "/help/policies?document=community-guidelines" },
  ],
};

describe("admin home content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({ revision: 2 });
    mocks.audit.mockResolvedValue({});
  });

  it("requires SUPER_ADMIN", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    const { GET } = await import("./route");
    expect((await GET(new NextRequest(url), { params: {} })).status).toBe(403);
  });

  it("persists text and three links", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { PATCH } = await import("./route");
    const response = await PATCH(new NextRequest(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validHero),
    }), { params: {} });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        homeHeroTitle: "首页标题",
        homeHeroLinks: validHero.links,
      }),
    }));
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("rejects external and protocol-relative destinations", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { PATCH } = await import("./route");
    for (const href of ["https://example.com", "//example.com"]) {
      const response = await PATCH(new NextRequest(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validHero, links: validHero.links.map((link, index) => index === 0 ? { ...link, href } : link) }),
      }), { params: {} });
      expect(response.status).toBe(400);
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
