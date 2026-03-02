import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockUserFindMany = vi.fn();
const mockUserCount = vi.fn();
const mockPostFindMany = vi.fn();
const mockPostCount = vi.fn();
const mockTagFindMany = vi.fn();
const mockTagCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      count: (...args: unknown[]) => mockUserCount(...args),
    },
    post: {
      findMany: (...args: unknown[]) => mockPostFindMany(...args),
      count: (...args: unknown[]) => mockPostCount(...args),
    },
    tag: {
      findMany: (...args: unknown[]) => mockTagFindMany(...args),
      count: (...args: unknown[]) => mockTagCount(...args),
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

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const defaultUserAttrs = {
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  violationCount: 0,
  onboardingDone: true,
  quizPassed: true,
  psychAccess: false,
  dcrAccess: false,
  dcrPledgeSigned: false,
  reputationScore: 100,
  role: "USER",
};

// ==================== Tests ====================

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeRequest("http://localhost:3000/api/search?q=test"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 400 当缺少搜索关键词", async () => {
    setSession("user1", "USER");
    const { GET } = await import("../route");
    const res = await GET(makeRequest("http://localhost:3000/api/search"), { params: {} });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("参数校验失败");
  });

  it("应返回 400 当搜索关键词超过 100 字符", async () => {
    setSession("user1", "USER");
    const longQuery = "a".repeat(101);
    const { GET } = await import("../route");
    const res = await GET(
      makeRequest(`http://localhost:3000/api/search?q=${longQuery}`),
      { params: {} },
    );
    expect(res.status).toBe(400);
  });

  // ==================== Posts Search ====================

  describe("帖子搜索 (type=posts)", () => {
    it("应按标题和内容搜索帖子并返回分页结果", async () => {
      setSession("user1", "USER");
      mockUserFindUnique.mockResolvedValue(defaultUserAttrs);

      const posts = [
        {
          id: "p1",
          title: "测试帖子",
          content: "内容",
          author: { id: "a1", nickname: "作者", avatar: null },
          board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
          tags: [],
        },
      ];
      mockPostFindMany.mockResolvedValue(posts);
      mockPostCount.mockResolvedValue(1);

      const { GET } = await import("../route");
      const res = await GET(
        makeRequest("http://localhost:3000/api/search?q=测试&type=posts"),
        { params: {} },
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.results).toEqual(posts);
      expect(data.total).toBe(1);
      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(20);
    });

    it("应只展示 PUBLISHED 状态的帖子", async () => {
      setSession("user1", "USER");
      mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
      mockPostFindMany.mockResolvedValue([]);
      mockPostCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=posts"),
        { params: {} },
      );

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "PUBLISHED",
          }),
        }),
      );
    });

    it("应过滤 shadow banned 用户的帖子", async () => {
      setSession("user1", "USER");
      mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
      mockPostFindMany.mockResolvedValue([]);
      mockPostCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=posts"),
        { params: {} },
      );

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            author: { isShadowBanned: false },
          }),
        }),
      );
    });

    it("普通用户应只能搜索 PUBLIC 区帖子", async () => {
      setSession("user1", "USER");
      mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
      mockPostFindMany.mockResolvedValue([]);
      mockPostCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=posts"),
        { params: {} },
      );

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            board: { zone: { in: ["PUBLIC"] } },
          }),
        }),
      );
    });

    it("有心理区权限的用户应能搜索 PSYCHOLOGY 区帖子", async () => {
      setSession("user1", "TRUSTED_USER");
      mockUserFindUnique.mockResolvedValue({
        ...defaultUserAttrs,
        role: "TRUSTED_USER",
        psychAccess: true,
      });
      mockPostFindMany.mockResolvedValue([]);
      mockPostCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=posts"),
        { params: {} },
      );

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            board: { zone: { in: expect.arrayContaining(["PUBLIC", "PSYCHOLOGY"]) } },
          }),
        }),
      );
    });

    it("有 DCR 权限的用户应能搜索 DCR 区帖子", async () => {
      setSession("user1", "TRUSTED_USER");
      mockUserFindUnique.mockResolvedValue({
        ...defaultUserAttrs,
        role: "TRUSTED_USER",
        dcrAccess: true,
        dcrPledgeSigned: true,
      });
      mockPostFindMany.mockResolvedValue([]);
      mockPostCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=posts"),
        { params: {} },
      );

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            board: { zone: { in: expect.arrayContaining(["PUBLIC", "DCR"]) } },
          }),
        }),
      );
    });

    it("应支持按板块筛选", async () => {
      setSession("user1", "USER");
      mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
      mockPostFindMany.mockResolvedValue([]);
      mockPostCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=posts&boardId=clxxxxxxxxxxxxxxxxxx001"),
        { params: {} },
      );

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            boardId: "clxxxxxxxxxxxxxxxxxx001",
          }),
        }),
      );
    });

    it("应支持分页参数", async () => {
      setSession("user1", "USER");
      mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
      mockPostFindMany.mockResolvedValue([]);
      mockPostCount.mockResolvedValue(50);

      const { GET } = await import("../route");
      const res = await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=posts&page=3&pageSize=10"),
        { params: {} },
      );
      const data = await res.json();

      expect(data.page).toBe(3);
      expect(data.pageSize).toBe(10);
      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it("应返回 404 当用户不存在", async () => {
      setSession("ghost", "USER");
      mockUserFindUnique.mockResolvedValue(null);

      const { GET } = await import("../route");
      const res = await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=posts"),
        { params: {} },
      );
      expect(res.status).toBe(404);
    });
  });

  // ==================== Users Search ====================

  describe("用户搜索 (type=users)", () => {
    it("应按昵称搜索用户并返回公开信息", async () => {
      setSession("user1", "USER");

      const users = [
        { id: "u1", nickname: "测试用户", avatar: null, createdAt: "2025-01-01T00:00:00.000Z", _count: { posts: 5 } },
      ];
      mockUserFindMany.mockResolvedValue(users);
      mockUserCount.mockResolvedValue(1);

      const { GET } = await import("../route");
      const res = await GET(
        makeRequest("http://localhost:3000/api/search?q=测试&type=users"),
        { params: {} },
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.results).toEqual(users);
      expect(data.total).toBe(1);
    });

    it("应过滤被封禁的用户", async () => {
      setSession("user1", "USER");
      mockUserFindMany.mockResolvedValue([]);
      mockUserCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=users"),
        { params: {} },
      );

      expect(mockUserFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isBanned: false,
          }),
        }),
      );
    });

    it("应只返回公开字段（id, nickname, avatar, createdAt, 发帖数）", async () => {
      setSession("user1", "USER");
      mockUserFindMany.mockResolvedValue([]);
      mockUserCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=users"),
        { params: {} },
      );

      expect(mockUserFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nickname: true,
            avatar: true,
            createdAt: true,
            _count: { select: { posts: true } },
          },
        }),
      );
    });
  });

  // ==================== Tags Search ====================

  describe("话题搜索 (type=tags)", () => {
    it("应按名称搜索标签并包含帖子数量", async () => {
      setSession("user1", "USER");

      const tags = [
        { id: "t1", name: "测试标签", _count: { posts: 10 } },
      ];
      mockTagFindMany.mockResolvedValue(tags);
      mockTagCount.mockResolvedValue(1);

      const { GET } = await import("../route");
      const res = await GET(
        makeRequest("http://localhost:3000/api/search?q=测试&type=tags"),
        { params: {} },
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.results).toEqual(tags);
      expect(data.total).toBe(1);
    });

    it("应包含帖子数量统计", async () => {
      setSession("user1", "USER");
      mockTagFindMany.mockResolvedValue([]);
      mockTagCount.mockResolvedValue(0);

      const { GET } = await import("../route");
      await GET(
        makeRequest("http://localhost:3000/api/search?q=test&type=tags"),
        { params: {} },
      );

      expect(mockTagFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            _count: { select: { posts: true } },
          }),
        }),
      );
    });
  });

  // ==================== Default type ====================

  it("应默认搜索帖子（不传 type 参数）", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest("http://localhost:3000/api/search?q=test"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    // Should have called post search (not user or tag)
    expect(mockPostFindMany).toHaveBeenCalled();
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockTagFindMany).not.toHaveBeenCalled();
  });
});
