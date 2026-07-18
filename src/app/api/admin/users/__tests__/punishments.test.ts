import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  punishmentFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    userPunishment: { findMany: mocks.punishmentFindMany },
  },
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET } from "../[id]/punishments/route";

function request() {
  return new NextRequest("http://localhost/api/admin/users/user1/punishments");
}

describe("GET /api/admin/users/[id]/punishments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("非管理员不能查看处罚历史", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user2", role: "USER" },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);

    const response = await GET(request(), { params: { id: "user1" } });

    expect(response.status).toBe(403);
    expect(mocks.punishmentFindMany).not.toHaveBeenCalled();
  });

  it("按时间倒序返回用户处罚和操作人信息", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "admin1", role: "ADMIN" },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);
    mocks.userFindUnique.mockResolvedValue({ id: "user1" });
    mocks.punishmentFindMany.mockResolvedValue([{
      id: "punishment1",
      type: "ACCOUNT_BAN",
      action: "APPLIED",
      reason: "多次发布违规内容",
      createdAt: new Date("2026-07-17T00:00:00Z"),
      operator: { id: "admin1", nickname: "管理员", phone: "18888888888" },
    }]);

    const response = await GET(request(), { params: { id: "user1" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.punishments).toHaveLength(1);
    expect(mocks.punishmentFindMany).toHaveBeenCalledWith({
      where: { userId: "user1" },
      include: { operator: { select: { id: true, nickname: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  it("目标用户不存在时返回 404", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "admin1", role: "ADMIN" },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await GET(request(), { params: { id: "missing" } });

    expect(response.status).toBe(404);
  });
});
