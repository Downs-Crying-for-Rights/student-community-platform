import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    inviteCode: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

const mockLogAudit = vi.fn().mockResolvedValue({});
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: {
    INVITE_REVOKE: "INVITE_REVOKE",
  },
  AuditTargetType: {
    INVITE_CODE: "INVITE_CODE",
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/invites/inv1", {
    method: "DELETE",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("DELETE /api/admin/invites/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "inv1" }),
    });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户访问", async () => {
    setSession("user1", "USER");
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "inv1" }),
    });
    expect(res.status).toBe(403);
  });

  it("应返回 403 当 Moderator 用户访问", async () => {
    setSession("mod1", "MODERATOR");
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "inv1" }),
    });
    expect(res.status).toBe(403);
  });

  it("应返回 404 当邀请码不存在", async () => {
    setSession("admin1", "ADMIN");
    mockFindUnique.mockResolvedValue(null);

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("不存在");
  });

  it("应返回 400 当邀请码已被使用", async () => {
    setSession("admin1", "ADMIN");
    mockFindUnique.mockResolvedValue({
      id: "inv1",
      code: "ABCD1234",
      isUsed: true,
      isRevoked: false,
    });

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("已使用");
  });

  it("应返回 400 当邀请码已被撤销", async () => {
    setSession("admin1", "ADMIN");
    mockFindUnique.mockResolvedValue({
      id: "inv1",
      code: "ABCD1234",
      isUsed: false,
      isRevoked: true,
    });

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("已被撤销");
  });

  it("应成功撤销邀请码并记录审计日志", async () => {
    setSession("admin1", "ADMIN");
    mockFindUnique.mockResolvedValue({
      id: "inv1",
      code: "ABCD1234",
      isUsed: false,
      isRevoked: false,
    });
    mockUpdate.mockResolvedValue({
      id: "inv1",
      code: "ABCD1234",
      isRevoked: true,
    });

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.invite.isRevoked).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1" },
        data: { isRevoked: true },
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "admin1",
      "INVITE_REVOKE",
      "INVITE_CODE",
      "inv1",
      { code: "ABCD1234" },
    );
  });
});
