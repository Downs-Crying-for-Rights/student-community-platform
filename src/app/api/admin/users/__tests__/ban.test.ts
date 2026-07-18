import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockPunishmentCreateMany = vi.fn();
const mockAuditLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
      userPunishment: { createMany: (...args: unknown[]) => mockPunishmentCreateMany(...args) },
      auditLog: { create: (...args: unknown[]) => mockAuditLogCreate(...args) },
    }),
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: {
    USER_BAN: "USER_BAN",
    USER_UNBAN: "USER_UNBAN",
    SHADOW_BAN: "SHADOW_BAN",
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
  const requestBody = body && typeof body === "object" && !Array.isArray(body)
    ? { reason: "测试操作原因", ...body as Record<string, unknown> }
    : body;
  return new NextRequest("http://localhost:3000/api/admin/users/u1/ban", {
    method: "POST",
    body: JSON.stringify(requestBody),
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

describe("POST /api/admin/users/[id]/ban", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPunishmentCreateMany.mockResolvedValue({ count: 1 });
  });

  it("should return 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "ban" }), {
      params: Promise.resolve({ id: "u1" }) as any,
    });
    expect(res.status).toBe(401);
  });

  it("should return 403 for non-Admin users", async () => {
    setSession("mod1", "MODERATOR");
    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "ban" }), {
      params: Promise.resolve({ id: "u1" }) as any,
    });
    expect(res.status).toBe(403);
  });

  it("should return 404 when target user not found", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue(null);

    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "ban" }), {
      params: Promise.resolve({ id: "nonexistent" }) as any,
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("不存在");
  });

  it("should return 400 when trying to ban self", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "admin1" });

    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "ban" }), {
      params: Promise.resolve({ id: "admin1" }) as any,
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("封禁自己");
  });

  it("should return 400 for invalid action", async () => {
    setSession("admin1", "ADMIN");

    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "invalid" }), {
      params: Promise.resolve({ id: "u1" }) as any,
    });

    expect(res.status).toBe(400);
  });

  it("should ban user and record audit log", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1", isBanned: false, isShadowBanned: false });
    const updatedUser = { id: "u1", email: "u1@test.com", nickname: "user1", isBanned: true, isShadowBanned: false };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "ban" }), {
      params: Promise.resolve({ id: "u1" }) as any,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.isBanned).toBe(true);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          isBanned: true,
          securityVersion: { increment: 1 },
        }),
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "admin1",
      "USER_BAN",
      "USER",
      "u1",
      { action: "ban", shadowBan: false, reason: "测试操作原因" },
      undefined,
      expect.anything(),
    );
    expect(mockPunishmentCreateMany).toHaveBeenCalledWith({ data: [{
      userId: "u1", operatorId: "admin1", type: "ACCOUNT_BAN", action: "APPLIED", reason: "测试操作原因",
    }] });
  });

  it("should shadow ban user and record audit log", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1", isBanned: false, isShadowBanned: false });
    const updatedUser = { id: "u1", email: "u1@test.com", nickname: "user1", isBanned: false, isShadowBanned: true };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "ban", shadowBan: true }), {
      params: Promise.resolve({ id: "u1" }) as any,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.isShadowBanned).toBe(true);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { isShadowBanned: true },
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "admin1",
      "SHADOW_BAN",
      "USER",
      "u1",
      { action: "ban", shadowBan: true, reason: "测试操作原因" },
      undefined,
      expect.anything(),
    );
  });

  it("should unban user and clear all ban flags", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1", isBanned: true, isShadowBanned: true });
    const updatedUser = { id: "u1", email: "u1@test.com", nickname: "user1", isBanned: false, isShadowBanned: false };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "unban" }), {
      params: Promise.resolve({ id: "u1" }) as any,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.isBanned).toBe(false);
    expect(data.user.isShadowBanned).toBe(false);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          isBanned: false,
          isShadowBanned: false,
          securityVersion: { increment: 1 },
        }),
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "admin1",
      "USER_UNBAN",
      "USER",
      "u1",
      { action: "unban", shadowBan: false, reason: "测试操作原因" },
      undefined,
      expect.anything(),
    );
    expect(mockPunishmentCreateMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ type: "ACCOUNT_BAN", action: "REVOKED" }),
      expect.objectContaining({ type: "POST_SHADOW_HIDE", action: "REVOKED" }),
    ]) });
  });

  it("should support ban with reason", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindUnique.mockResolvedValue({ id: "u1" });
    mockUserUpdate.mockResolvedValue({ id: "u1", email: null, nickname: null, isBanned: true, isShadowBanned: false });
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../[id]/ban/route");
    const res = await POST(
      makeRequest({ action: "ban", reason: "repeated violations" }),
      { params: Promise.resolve({ id: "u1" }) as any },
    );

    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      "admin1",
      "USER_BAN",
      "USER",
      "u1",
      { action: "ban", shadowBan: false, reason: "repeated violations" },
      undefined,
      expect.anything(),
    );
  });

  it("should reject a ban without a reason", async () => {
    setSession("admin1", "ADMIN");

    const { POST } = await import("../[id]/ban/route");
    const res = await POST(makeRequest({ action: "ban", reason: undefined }), {
      params: Promise.resolve({ id: "u1" }) as any,
    });

    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
