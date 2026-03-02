import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockPostFindUnique = vi.fn();
const mockBookmarkFindUnique = vi.fn();
const mockBookmarkCreate = vi.fn();
const mockBookmarkDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    post: {
      findUnique: (...args: unknown[]) => mockPostFindUnique(...args),
    },
    bookmark: {
      findUnique: (...args: unknown[]) => mockBookmarkFindUnique(...args),
      create: (...args: unknown[]) => mockBookmarkCreate(...args),
      delete: (...args: unknown[]) => mockBookmarkDelete(...args),
    },
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
  return new NextRequest("http://localhost:3000/api/posts/p1/bookmark", {
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

describe("POST /api/posts/[id]/bookmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../../bookmark/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当帖子不存在", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue(null);

    const { POST } = await import("../../bookmark/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 404 当帖子已删除", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", status: "DELETED" });

    const { POST } = await import("../../bookmark/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应成功收藏并返回 bookmarked: true", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockBookmarkFindUnique.mockResolvedValue(null);
    mockBookmarkCreate.mockResolvedValue({
      userId: "user1",
      postId: "p1",
      createdAt: new Date(),
    });

    const { POST } = await import("../../bookmark/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.bookmarked).toBe(true);
    expect(mockBookmarkCreate).toHaveBeenCalledWith({
      data: { userId: "user1", postId: "p1" },
    });
  });

  it("应成功取消收藏并返回 bookmarked: false", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockBookmarkFindUnique.mockResolvedValue({
      userId: "user1",
      postId: "p1",
      createdAt: new Date(),
    });
    mockBookmarkDelete.mockResolvedValue({});

    const { POST } = await import("../../bookmark/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.bookmarked).toBe(false);
    expect(mockBookmarkDelete).toHaveBeenCalledWith({
      where: { userId_postId: { userId: "user1", postId: "p1" } },
    });
  });

  it("应返回 500 当数据库操作失败", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockBookmarkFindUnique.mockRejectedValue(new Error("DB error"));

    const { POST } = await import("../../bookmark/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(500);
  });
});
