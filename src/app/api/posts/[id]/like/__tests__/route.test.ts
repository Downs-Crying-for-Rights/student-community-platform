import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockPostFindUnique = vi.fn();
const mockPostUpdate = vi.fn();
const mockLikeFindUnique = vi.fn();
const mockLikeCreate = vi.fn();
const mockLikeDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    post: {
      findUnique: (...args: unknown[]) => mockPostFindUnique(...args),
      update: (...args: unknown[]) => mockPostUpdate(...args),
    },
    like: {
      findUnique: (...args: unknown[]) => mockLikeFindUnique(...args),
      create: (...args: unknown[]) => mockLikeCreate(...args),
      delete: (...args: unknown[]) => mockLikeDelete(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
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
  return new NextRequest("http://localhost:3000/api/posts/p1/like", {
    method: "POST",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("POST /api/posts/[id]/like", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../../like/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当帖子不存在", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue(null);

    const { POST } = await import("../../like/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 404 当帖子已删除", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", status: "DELETED" });

    const { POST } = await import("../../like/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应成功点赞并返回 liked: true", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockLikeFindUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([{}, { likeCount: 1 }]);

    const { POST } = await import("../../like/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.liked).toBe(true);
    expect(data.likeCount).toBe(1);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("应成功取消点赞并返回 liked: false", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockLikeFindUnique.mockResolvedValue({
      userId: "user1",
      postId: "p1",
      createdAt: new Date(),
    });
    mockTransaction.mockResolvedValue([{}, { likeCount: 0 }]);

    const { POST } = await import("../../like/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.liked).toBe(false);
    expect(data.likeCount).toBe(0);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("应返回 500 当数据库操作失败", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockLikeFindUnique.mockRejectedValue(new Error("DB error"));

    const { POST } = await import("../../like/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(500);
  });
});
