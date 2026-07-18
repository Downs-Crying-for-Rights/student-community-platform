import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { post: { findMany: mocks.findMany, count: mocks.count } },
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
});
