import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockRecommendationFindMany = vi.fn();
const mockPostFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    weeklyRecommendation: {
      findMany: (...args: unknown[]) => mockRecommendationFindMany(...args),
    },
    post: {
      findMany: (...args: unknown[]) => mockPostFindMany(...args),
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
  return new NextRequest("http://localhost:3000/api/recommendations", {
    method: "GET",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("GET /api/recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未登录用户应看到公开的活跃推荐", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const recommendations = [
      { id: "r1", title: "推荐1", postId: null, sortOrder: 0, isActive: true },
    ];
    mockRecommendationFindMany.mockResolvedValue(recommendations);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.recommendations).toEqual([
      expect.objectContaining({ id: "r1", post: null }),
    ]);
  });

  it("应返回按 sortOrder 排序的活跃推荐列表", async () => {
    setSession("user1", "USER");

    const recommendations = [
      { id: "r1", title: "推荐1", postId: null, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: "r2", title: "推荐2", postId: null, sortOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ];
    mockRecommendationFindMany.mockResolvedValue(recommendations);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.recommendations).toHaveLength(2);
    expect(data.recommendations[0].title).toBe("推荐1");
    expect(data.recommendations[1].title).toBe("推荐2");
    expect(mockRecommendationFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  });

  it("应包含关联的帖子数据当 postId 存在", async () => {
    setSession("user1", "USER");

    const recommendations = [
      { id: "r1", title: "推荐1", postId: "p1", sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: "r2", title: "推荐2", postId: null, sortOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ];
    mockRecommendationFindMany.mockResolvedValue(recommendations);

    const postData = {
      id: "p1",
      title: "帖子标题",
      summary: "摘要",
      images: [],
      likeCount: 10,
      commentCount: 5,
      createdAt: new Date(),
      author: { id: "a1", nickname: "作者", avatar: null },
    };
    mockPostFindMany.mockResolvedValue([postData]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.recommendations[0].post).toBeTruthy();
    expect(data.recommendations[0].post.title).toBe("帖子标题");
    expect(data.recommendations[1].post).toBeNull();
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["p1"] }, status: "PUBLISHED", visibility: "PUBLIC",
          board: { zone: "PUBLIC" }, author: { isShadowBanned: false },
        },
      }),
    );
  });

  it("应返回 post 为 null 当关联帖子不存在或未发布", async () => {
    setSession("user1", "USER");

    const recommendations = [
      { id: "r1", title: "推荐1", postId: "p-deleted", sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ];
    mockRecommendationFindMany.mockResolvedValue(recommendations);
    mockPostFindMany.mockResolvedValue([]); // post not found or not published

    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.recommendations[0].post).toBeNull();
  });

  it("每次请求都重新校验推荐帖可见性", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockRecommendationFindMany.mockResolvedValue([{ id: "r1", postId: "p1", sortOrder: 0, isActive: true }]);
    mockPostFindMany.mockResolvedValueOnce([{ id: "p1", title: "可见" }]).mockResolvedValueOnce([]);
    const { GET } = await import("../route");

    const first = await (await GET(makeRequest(), { params: {} })).json();
    const second = await (await GET(makeRequest(), { params: {} })).json();

    expect(first.recommendations[0].post).toMatchObject({ id: "p1" });
    expect(second.recommendations[0].post).toBeNull();
    expect(mockPostFindMany).toHaveBeenCalledTimes(2);
  });

  it("应返回空数组当没有活跃推荐", async () => {
    setSession("user1", "USER");
    mockRecommendationFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.recommendations).toEqual([]);
    expect(mockPostFindMany).not.toHaveBeenCalled();
  });

  it("应在数据库错误时返回 500", async () => {
    setSession("user1", "USER");
    mockRecommendationFindMany.mockRejectedValue(new Error("DB error"));

    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("服务器内部错误");
  });
});
