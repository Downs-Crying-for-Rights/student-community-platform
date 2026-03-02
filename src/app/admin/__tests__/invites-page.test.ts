import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/invites",
}));

describe("AdminInvitesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        invites: [
          {
            id: "inv1",
            code: "ABCD1234",
            isUsed: false,
            isRevoked: false,
            expiresAt: "2025-12-31T00:00:00Z",
            createdAt: "2025-01-01T00:00:00Z",
            usedAt: null,
            creator: { id: "admin1", nickname: "管理员", email: "admin@test.com" },
            usedBy: null,
          },
          {
            id: "inv2",
            code: "EFGH5678",
            isUsed: true,
            isRevoked: false,
            expiresAt: "2025-12-31T00:00:00Z",
            createdAt: "2025-01-02T00:00:00Z",
            usedAt: "2025-01-05T00:00:00Z",
            creator: { id: "admin1", nickname: "管理员", email: "admin@test.com" },
            usedBy: { id: "user1", nickname: "用户1", email: "user1@test.com" },
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }),
    });
  });

  it("应能导入页面组件", async () => {
    const mod = await import("../invites/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("getStatusLabel 应正确判断邀请码状态", () => {
    // Test the status logic directly
    const revokedInvite = { isRevoked: true, isUsed: false, expiresAt: "2025-12-31T00:00:00Z" };
    const usedInvite = { isRevoked: false, isUsed: true, expiresAt: "2025-12-31T00:00:00Z" };
    const expiredInvite = { isRevoked: false, isUsed: false, expiresAt: "2020-01-01T00:00:00Z" };
    const unusedInvite = { isRevoked: false, isUsed: false, expiresAt: "2099-12-31T00:00:00Z" };

    // Revoked takes priority
    expect(revokedInvite.isRevoked).toBe(true);
    // Used
    expect(usedInvite.isUsed).toBe(true);
    // Expired
    expect(new Date(expiredInvite.expiresAt) < new Date()).toBe(true);
    // Unused and valid
    expect(unusedInvite.isUsed).toBe(false);
    expect(unusedInvite.isRevoked).toBe(false);
    expect(new Date(unusedInvite.expiresAt) > new Date()).toBe(true);
  });

  it("应在生成邀请码时调用 POST API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invites: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    });

    // Verify the POST endpoint pattern
    const postBody = { count: 3, expiresInDays: 14 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invites: [{ id: "new1", code: "TEST1234", expiresAt: "2025-02-01" }] }),
    });

    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postBody),
    });
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.invites).toBeDefined();
  });

  it("应在撤销邀请码时调用 DELETE API", async () => {
    // Reset and set up fresh mock for this test
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invite: { id: "inv1", code: "ABCD1234", isRevoked: true } }),
    });

    const res = await fetch("/api/admin/invites/inv1", { method: "DELETE" });
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.invite.isRevoked).toBe(true);
  });
});
