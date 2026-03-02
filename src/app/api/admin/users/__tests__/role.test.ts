import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: {
    ROLE_CHANGE: "ROLE_CHANGE",
    SUPER_ADMIN_OVERRIDE: "SUPER_ADMIN_OVERRIDE",
  },
  AuditTargetType: {
    USER: "USER",
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

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users/u1/role", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("PATCH /api/admin/users/[id]/role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "MODERATOR" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户访问", async () => {
    setSession("user1", "USER");
    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "MODERATOR" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(403);
  });

  it("应返回 404 当目标用户不存在", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "MODERATOR" }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("用户不存在");
  });

  it("应返回 400 当角色未变更", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1", role: "USER" });

    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "USER" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("角色未变更");
  });

  it("应返回 400 当角色值无效", async () => {
    setSession("admin1", "ADMIN");

    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "INVALID_ROLE" }), {
      params: Promise.resolve({ id: "u1" }),
    });

    expect(res.status).toBe(400);
  });

  it("应成功变更角色并记录审计日志", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1", role: "USER" });
    const updatedUser = { id: "u1", email: "u1@test.com", nickname: "用户1", role: "MODERATOR" };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "MODERATOR" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user).toEqual(updatedUser);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { role: "MODERATOR" },
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "admin1",
      "ROLE_CHANGE",
      "USER",
      "u1",
      { oldRole: "USER", newRole: "MODERATOR" },
    );
  });

  // ==================== SUPER_ADMIN 角色变更保护测试 ====================

  it("应返回 403 当非 SUPER_ADMIN 尝试授予 SUPER_ADMIN 角色", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1", role: "USER" });

    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "SUPER_ADMIN" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("仅超级管理员可授予此角色");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("应允许 SUPER_ADMIN 授予 SUPER_ADMIN 角色", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1", role: "ADMIN" });
    const updatedUser = { id: "u1", email: "u1@test.com", nickname: "用户1", role: "SUPER_ADMIN" };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "SUPER_ADMIN" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.role).toBe("SUPER_ADMIN");
    expect(mockUserUpdate).toHaveBeenCalled();
  });

  it("应返回 403 当 SUPER_ADMIN 尝试降级自身角色", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "sa1", role: "SUPER_ADMIN" });

    const { PATCH } = await import("../[id]/role/route");
    const res = await PATCH(makeRequest({ role: "ADMIN" }), {
      params: Promise.resolve({ id: "sa1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("不可降级自身角色");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("应在 SUPER_ADMIN 角色变更时记录高优先级审计日志", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1", role: "ADMIN" });
    const updatedUser = { id: "u1", email: "u1@test.com", nickname: "用户1", role: "SUPER_ADMIN" };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../[id]/role/route");
    await PATCH(makeRequest({ role: "SUPER_ADMIN" }), {
      params: Promise.resolve({ id: "u1" }),
    });

    // 应记录常规 ROLE_CHANGE 日志
    expect(mockLogAudit).toHaveBeenCalledWith(
      "sa1",
      "ROLE_CHANGE",
      "USER",
      "u1",
      { oldRole: "ADMIN", newRole: "SUPER_ADMIN" },
    );
    // 应额外记录高优先级 SUPER_ADMIN_OVERRIDE 审计日志
    expect(mockLogAudit).toHaveBeenCalledWith(
      "sa1",
      "SUPER_ADMIN_OVERRIDE",
      "USER",
      "u1",
      { oldRole: "ADMIN", newRole: "SUPER_ADMIN", priority: "HIGH" },
    );
    expect(mockLogAudit).toHaveBeenCalledTimes(2);
  });
});
