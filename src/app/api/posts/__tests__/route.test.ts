import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockBoardFindUnique = vi.fn();
const mockPostFindMany = vi.fn();
const mockPostCount = vi.fn();
const mockPostCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    board: { findUnique: (...args: unknown[]) => mockBoardFindUnique(...args) },
    post: {
      findMany: (...args: unknown[]) => mockPostFindMany(...args),
      count: (...args: unknown[]) => mockPostCount(...args),
      create: (...args: unknown[]) => mockPostCreate(...args),
    },
  },
}));

const mockScanContent = vi.fn();
vi.mock("@/lib/sensitive-engine", () => ({
  scanContent: (...args: unknown[]) => mockScanContent(...args),
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditTargetType: { POST: "POST" },
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

function makeRequest(method: string, url?: string, body?: unknown): NextRequest {
  const fullUrl = url ?? "http://localhost:3000/api/posts";
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(fullUrl, init);
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

describe("GET /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回公开帖子列表（未登录用户）", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.posts).toEqual([]);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { status: "PUBLISHED" },
            { author: { isShadowBanned: false } },
          ],
        }),
      }),
    );
  });

  it("应返回分页帖子列表", async () => {
    setSession("user1", "USER");

    const posts = [
      { id: "p1", title: "帖子1", status: "PUBLISHED", author: { id: "user1", nickname: "用户1", avatar: null }, board: { id: "b1", name: "娱乐", zone: "PUBLIC" }, tags: [] },
    ];
    mockPostFindMany.mockResolvedValue(posts);
    mockPostCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.posts).toEqual(posts);
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
  });

  it("应支持按板块筛选", async () => {
    setSession("user1", "USER");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const url = "http://localhost:3000/api/posts?boardId=clxxxxxxxxxxxxxxxxxx001";
    const res = await GET(makeRequest("GET", url), { params: {} });

    expect(res.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          boardId: "clxxxxxxxxxxxxxxxxxx001",
        }),
      }),
    );
  });

  it("应默认过滤非 PUBLIC 区帖子（无 boardId 时）", async () => {
    setSession("user1", "USER");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });

    expect(res.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          board: { zone: "PUBLIC" },
        }),
      }),
    );
  });

  it("应支持按热度排序", async () => {
    setSession("user1", "USER");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const url = "http://localhost:3000/api/posts?sort=popular";
    const res = await GET(makeRequest("GET", url), { params: {} });

    expect(res.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
      }),
    );
  });
});


describe("POST /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, { title: "Test", content: "Content", boardId: "clxxxxxxxxxxxxxxxxxx001" }),
      { params: {} },
    );
    expect(res.status).toBe(401);
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, { title: "" }),
      { params: {} },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("参数校验失败");
  });

  it("应返回 404 当用户不存在", async () => {
    setSession("ghost", "USER");
    mockUserFindUnique.mockResolvedValue(null);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        title: "测试帖子",
        content: "测试内容",
        boardId: "clxxxxxxxxxxxxxxxxxx001",
      }),
      { params: {} },
    );
    expect(res.status).toBe(404);
  });

  it("应返回 404 当板块不存在", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
    mockBoardFindUnique.mockResolvedValue(null);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        title: "测试帖子",
        content: "测试内容",
        boardId: "clxxxxxxxxxxxxxxxxxx001",
      }),
      { params: {} },
    );
    expect(res.status).toBe(404);
  });

  it("应返回 403 当 ABAC 发帖频率限制触发", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({
      ...defaultUserAttrs,
      violationCount: 5, // exceeds threshold
    });
    mockBoardFindUnique.mockResolvedValue({ id: "b1", zone: "PUBLIC", isActive: true });
    mockPostCount.mockResolvedValue(1); // already posted 1 today, limit is 1

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        title: "测试帖子",
        content: "测试内容",
        boardId: "clxxxxxxxxxxxxxxxxxx001",
      }),
      { params: {} },
    );
    expect(res.status).toBe(403);
  });

  it("应返回 400 当内容包含敏感词", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
    mockBoardFindUnique.mockResolvedValue({ id: "b1", zone: "PUBLIC", isActive: true });
    mockPostCount.mockResolvedValue(0);
    mockScanContent.mockResolvedValue([
      { word: "敏感词", category: "PROFANITY", startIndex: 0, endIndex: 3 },
    ]);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        title: "敏感词标题",
        content: "正常内容",
        boardId: "clxxxxxxxxxxxxxxxxxx001",
      }),
      { params: {} },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("内容包含敏感词");
    expect(data.matches).toHaveLength(1);
  });

  it("应在公开区创建帖子并设置状态为 PENDING（待审核）", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue(defaultUserAttrs);
    mockBoardFindUnique.mockResolvedValue({ id: "b1", zone: "PUBLIC", isActive: true });
    mockPostCount.mockResolvedValue(0);
    mockScanContent.mockResolvedValue([]);
    mockLogAudit.mockResolvedValue({});

    const createdPost = {
      id: "p1",
      title: "测试帖子",
      content: "测试内容",
      status: "PENDING",
      author: { id: "user1", nickname: "用户1", avatar: null },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
    };
    mockPostCreate.mockResolvedValue(createdPost);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        title: "测试帖子",
        content: "测试内容",
        boardId: "clxxxxxxxxxxxxxxxxxx001",
      }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.post).toEqual(createdPost);
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          isAnonymous: false,
        }),
      }),
    );
  });

  it("应在 DCR 区创建帖子并设置状态为 PENDING", async () => {
    setSession("user1", "TRUSTED_USER");
    mockUserFindUnique.mockResolvedValue({
      ...defaultUserAttrs,
      role: "TRUSTED_USER",
      dcrAccess: true,
      dcrPledgeSigned: true,
    });
    mockBoardFindUnique.mockResolvedValue({ id: "b2", zone: "DCR", isActive: true });
    mockPostCount.mockResolvedValue(0);
    mockScanContent.mockResolvedValue([]);
    mockLogAudit.mockResolvedValue({});
    mockPostCreate.mockResolvedValue({
      id: "p2",
      status: "PENDING",
      board: { id: "b2", name: "DCR", zone: "DCR" },
    });

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        title: "DCR帖子",
        content: "DCR内容",
        boardId: "clxxxxxxxxxxxxxxxxxx002",
        dcrCategory: "TUTORING",
      }),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
        }),
      }),
    );
  });

  it("应在心理区强制匿名发帖", async () => {
    setSession("user1", "TRUSTED_USER");
    mockUserFindUnique.mockResolvedValue({
      ...defaultUserAttrs,
      role: "TRUSTED_USER",
      psychAccess: true,
    });
    mockBoardFindUnique.mockResolvedValue({ id: "b3", zone: "PSYCHOLOGY", isActive: true });
    mockPostCount.mockResolvedValue(0);
    mockScanContent.mockResolvedValue([]);
    mockLogAudit.mockResolvedValue({});
    mockPostCreate.mockResolvedValue({
      id: "p3",
      isAnonymous: true,
      anonymousId: "匿名用户_ABCD",
    });

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        title: "心理区帖子",
        content: "心理区内容",
        boardId: "clxxxxxxxxxxxxxxxxxx003",
      }),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isAnonymous: true,
          anonymousId: expect.stringContaining("匿名用户_"),
        }),
      }),
    );
  });
});
