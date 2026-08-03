import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), auditFindMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    post: { findMany: mocks.findMany, count: mocks.count },
    auditLog: { findMany: mocks.auditFindMany },
  },
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET } from "../route";

describe("GET /api/admin/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } } as never);
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.auditFindMany.mockResolvedValue([]);
  });

  it("支持按用户 ID 查看该用户全部帖子", async () => {
    const request = new NextRequest("http://localhost/api/admin/posts?authorId=cm1234567890123456789012&pageSize=50");

    const response = await GET(request, { params: {} });

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ authorId: "cm1234567890123456789012" }),
      take: 50,
    }));
  });

  it("返回帖子最近一次通过审核的管理员", async () => {
    mocks.findMany.mockResolvedValue([{
      id: "post1",
      title: "已通过帖子",
      content: "正文",
      status: "PUBLISHED",
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      author: { id: "user1", nickname: "用户", email: null },
      board: { id: "board1", name: "公共讨论" },
    }]);
    mocks.count.mockResolvedValue(1);
    mocks.auditFindMany.mockResolvedValue([{
      targetId: "post1",
      createdAt: new Date("2026-08-03T01:00:00.000Z"),
      operator: { id: "admin1", nickname: "审核员", username: "admin", role: "ADMIN" },
    }]);

    const response = await GET(
      new NextRequest("http://localhost/api/admin/posts?status=PUBLISHED"),
      { params: {} },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.posts[0].approvalAudit.operator).toEqual(expect.objectContaining({
      id: "admin1",
      nickname: "审核员",
      role: "ADMIN",
    }));
  });
});
