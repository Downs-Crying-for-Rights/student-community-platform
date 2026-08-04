import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  auditCreate: vi.fn(),
  logAudit: vi.fn(),
  scanContent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    user: { update: mocks.userUpdate },
    auditLog: { create: mocks.auditCreate },
  };
  return {
    default: {
      user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
  };
});
vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
  AuditAction: {
    ADMIN_PROFILE_CORRECT: "ADMIN_PROFILE_CORRECT",
    PHONE_EMERGENCY_CHANGE: "PHONE_EMERGENCY_CHANGE",
  },
  AuditTargetType: { USER: "USER" },
}));
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scanContent }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { PATCH } from "../[id]/profile/route";

function request(body: unknown) {
  const requestBody = body && typeof body === "object" && !Array.isArray(body)
    ? { reason: "测试资料修改", ticketId: "TEST-001", ...body as Record<string, unknown> }
    : body;
  return new NextRequest("http://localhost/api/admin/users/user1/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
}

describe("PATCH /api/admin/users/[id]/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scanContent.mockResolvedValue([]);
    mocks.userFindFirst.mockResolvedValue(null);
  });

  it("只有超级管理员可以修改身份资料", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } } as never);

    const response = await PATCH(request({ nickname: "新昵称" }), { params: { id: "user1" } });

    expect(response.status).toBe(403);
  });

  it("更新资料并只返回安全字段", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "super1", role: "SUPER_ADMIN" } } as never);
    mocks.userFindUnique.mockResolvedValue({
      id: "user1", nickname: "旧昵称", bio: null, avatar: null, email: null, phone: null,
    });
    mocks.userUpdate.mockResolvedValue({
      id: "user1", nickname: "新昵称", bio: "新简介", avatar: null,
      email: "user@example.com", phone: "18888888888", updatedAt: new Date(),
    });

    const response = await PATCH(request({
      nickname: "新昵称", bio: "新简介", email: "user@example.com", phone: "18888888888",
    }), { params: { id: "user1" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user.passwordHash).toBeUndefined();
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        nickname: "新昵称",
        bio: "新简介",
        email: "user@example.com",
        phone: "18888888888",
        securityVersion: { increment: 1 },
      }),
      select: expect.not.objectContaining({ passwordHash: true }),
    }));
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "super1",
      "PHONE_EMERGENCY_CHANGE",
      "USER",
      "user1",
      expect.objectContaining({
        reason: "测试资料修改",
        ticketId: "TEST-001",
        category: "PROFILE",
      }),
      undefined,
      expect.anything(),
    );
  });

  it("拒绝昵称或简介中的敏感内容", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "super1", role: "SUPER_ADMIN" } } as never);
    mocks.userFindUnique.mockResolvedValue({
      id: "user1", nickname: "旧昵称", bio: null, avatar: null, email: null, phone: null,
    });
    mocks.scanContent.mockResolvedValue([{ word: "敏感", category: "PROFANITY", startIndex: 0, endIndex: 2 }]);

    const response = await PATCH(request({ bio: "敏感内容" }), { params: { id: "user1" } });

    expect(response.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("拒绝管理员写入任意外链头像", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "super1", role: "SUPER_ADMIN" } } as never);
    mocks.userFindUnique.mockResolvedValue({
      id: "user1", nickname: "旧昵称", bio: null, avatar: null, email: null, phone: null,
    });

    const response = await PATCH(request({ avatar: "https://attacker.example/avatar.png" }), { params: { id: "user1" } });

    expect(response.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["reason", { nickname: "新昵称", reason: undefined }],
    ["ticketId", { nickname: "新昵称", ticketId: undefined }],
  ])("拒绝缺少 %s 的资料修改", async (_field, body) => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "super1", role: "SUPER_ADMIN" } } as never);

    const response = await PATCH(request(body), { params: { id: "user1" } });

    expect(response.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
