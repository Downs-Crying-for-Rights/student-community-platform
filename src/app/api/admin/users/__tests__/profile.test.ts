import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  auditCreate: vi.fn(),
  scanContent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    user: { update: mocks.userUpdate },
    auditLog: { create: mocks.auditCreate },
  };
  return {
    default: {
      user: { findUnique: mocks.userFindUnique },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
  };
});
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scanContent }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { PATCH } from "../[id]/profile/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/users/user1/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/users/[id]/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scanContent.mockResolvedValue([]);
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
      select: expect.not.objectContaining({ passwordHash: true }),
    }));
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
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
});
