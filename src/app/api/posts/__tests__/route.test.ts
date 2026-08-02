import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockBoardFindUnique = vi.fn();
const mockPostFindMany = vi.fn();
const mockPostCount = vi.fn();
const mockPostCreate = vi.fn();
const mockCaseFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    board: { findUnique: (...args: unknown[]) => mockBoardFindUnique(...args) },
    post: {
      findMany: (...args: unknown[]) => mockPostFindMany(...args),
      count: (...args: unknown[]) => mockPostCount(...args),
      create: (...args: unknown[]) => mockPostCreate(...args),
    },
    case: { findUnique: (...args: unknown[]) => mockCaseFindUnique(...args) },
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
  return new NextRequest(fullUrl, init as any);
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
            { status: { not: "DELETED" } },
            { visibility: "PUBLIC" },
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
    expect(data.posts).toEqual(posts.map((post) => ({ ...post, author: { ...post.author, isAdministrator: false, isVerified: false } })));
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
  });

  it("应支持按板块筛选", async () => {
    setSession("user1", "USER");
    mockBoardFindUnique.mockResolvedValue({ zone: "PUBLIC" });
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
        orderBy: [
          { isPinned: "desc" },
          { pinnedAt: "desc" },
          { likeCount: "desc" },
          { createdAt: "desc" },
        ],
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

  it("拒绝把任意外链作为帖子图片", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        title: "测试帖子",
        content: "测试内容",
        boardId: "clxxxxxxxxxxxxxxxxxx001",
        images: ["https://attacker.example/tracker.png"],
      }),
      { params: {} },
    );

    expect(res.status).toBe(400);
    expect(mockPostCreate).not.toHaveBeenCalled();
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
    expect(data.post).toEqual({ ...createdPost, author: { ...createdPost.author, isAdministrator: false, isVerified: false } });
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

  it("普通用户列表仅额外包含自己的 MODS_ONLY 帖子", async () => {
    setSession("user1", "USER");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    await GET(makeRequest("GET"), { params: {} });

    expect(mockPostFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{
          OR: [
            { visibility: "PUBLIC" },
            { visibility: "MODS_ONLY", authorId: "user1" },
          ],
        }]),
      }),
    }));
  });

  it("拒绝跨用户查询收藏或点赞记录", async () => {
    setSession("user1", "USER");
    const { GET } = await import("../route");

    const bookmarked = await GET(makeRequest("GET", "http://localhost:3000/api/posts?bookmarkedBy=user2"), { params: {} });
    const liked = await GET(makeRequest("GET", "http://localhost:3000/api/posts?likedBy=user2"), { params: {} });

    expect(bookmarked.status).toBe(403);
    expect(liked.status).toBe(403);
    expect(mockPostFindMany).not.toHaveBeenCalled();
  });

  it("DCR 列表要求已签署承诺", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true, dcrPledgeSigned: false });
    const { GET } = await import("../route");

    const res = await GET(makeRequest("GET", "http://localhost:3000/api/posts?zone=DCR"), { params: {} });

    expect(res.status).toBe(403);
    expect(mockPostFindMany).not.toHaveBeenCalled();
  });

  it("DCR MATCHED 列表使用共享参与者条件", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true, dcrPledgeSigned: true });
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);
    const { GET } = await import("../route");

    const res = await GET(makeRequest("GET", "http://localhost:3000/api/posts?zone=DCR"), { params: {} });

    expect(res.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([expect.objectContaining({
          OR: expect.arrayContaining([expect.objectContaining({
            AND: [
              { visibility: "MATCHED" },
              expect.objectContaining({ OR: expect.arrayContaining([{ authorId: "user1" }]) }),
            ],
          })]),
        })]),
      }),
    }));
  });

  it("投稿邀请码用户可创建 DCR 帖子但无需完整准入", async () => {
    setSession("contributor", "USER");
    mockUserFindUnique.mockResolvedValue({
      ...defaultUserAttrs,
      role: "USER",
      dcrAccess: false,
      dcrPledgeSigned: false,
      dcrContributionAccess: true,
    });
    mockBoardFindUnique.mockResolvedValue({ id: "b2", zone: "DCR", isActive: true });
    mockPostCount.mockResolvedValue(0);
    mockScanContent.mockResolvedValue([]);
    mockPostCreate.mockResolvedValue({ id: "p-contribution", status: "PENDING", board: { zone: "DCR" } });

    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", undefined, {
      title: "投稿帖子", content: "投稿内容", boardId: "clxxxxxxxxxxxxxxxxxx002", dcrCategory: "TUTORING",
    }), { params: {} });

    expect(res.status).toBe(201);
  });

  it("DCR 帖子可关联本人参与且已过审的工单", async () => {
    setSession("user1", "TRUSTED_USER");
    mockUserFindUnique.mockResolvedValue({ ...defaultUserAttrs, dcrAccess: true, dcrPledgeSigned: true });
    mockBoardFindUnique.mockResolvedValue({ id: "b2", zone: "DCR", isActive: true });
    mockCaseFindUnique.mockResolvedValue({ submitterId: "user1", requestStatus: "APPROVED", handlers: [] });
    mockPostCount.mockResolvedValue(0);
    mockScanContent.mockResolvedValue([]);
    mockPostCreate.mockResolvedValue({ id: "p-case", caseId: "clxxxxxxxxxxxxxxxxxx009", board: { zone: "DCR" } });

    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", undefined, {
      title: "关联工单互助",
      content: "邀请 DCR 成员参与这张工单的信息互助",
      boardId: "clxxxxxxxxxxxxxxxxxx002",
      caseId: "clxxxxxxxxxxxxxxxxxx009",
    }), { params: {} });

    expect(res.status).toBe(201);
    expect(mockPostCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ caseId: "clxxxxxxxxxxxxxxxxxx009" }),
    }));
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
      authorId: "user1",
      isAnonymous: true,
      anonymousId: "匿名用户_ABCD",
      author: { id: "user1", nickname: "真实姓名", avatar: "real.png" },
      board: { id: "b3", name: "心理", zone: "PSYCHOLOGY" },
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
    const data = await res.json();
    expect(data.post.authorId).toBe("匿名用户_ABCD");
    expect(data.post.author).toEqual({ id: "匿名用户_ABCD", nickname: "匿名用户_ABCD", avatar: null, isVerified: false });
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isAnonymous: true,
          anonymousId: expect.stringContaining("匿名用户_"),
        }),
      }),
    );
  });

  it("通过 boardId 查询心理区时仍校验数据库准入", async () => {
    setSession("user1", "USER");
    mockBoardFindUnique.mockResolvedValue({ zone: "PSYCHOLOGY" });
    mockUserFindUnique.mockResolvedValue({ psychAccess: false, dcrAccess: false });

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET", "http://localhost:3000/api/posts?boardId=clxxxxxxxxxxxxxxxxxx001"), { params: {} });

    expect(res.status).toBe(403);
    expect(mockPostFindMany).not.toHaveBeenCalled();
  });

  it("心理区拒绝可识别用户身份的列表筛选", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true, dcrAccess: false });
    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET", "http://localhost:3000/api/posts?zone=PSYCHOLOGY&authorId=real-user"), { params: {} });
    expect(res.status).toBe(400);
  });

  it("应拒绝创建心理区 MATCHED 帖子", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ ...defaultUserAttrs, psychAccess: true });
    mockBoardFindUnique.mockResolvedValue({ id: "b3", zone: "PSYCHOLOGY", isActive: true });
    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", undefined, {
      title: "匹配帖子",
      content: "内容",
      boardId: "clxxxxxxxxxxxxxxxxxx001",
      visibility: "MATCHED",
    }), { params: {} });

    expect(res.status).toBe(400);
    expect(mockPostCreate).not.toHaveBeenCalled();
  });

  it("版主无需 psychAccess 也可创建心理帖子", async () => {
    setSession("mod1", "MODERATOR");
    mockUserFindUnique.mockResolvedValue({ ...defaultUserAttrs, role: "MODERATOR", psychAccess: false });
    mockBoardFindUnique.mockResolvedValue({ id: "b3", zone: "PSYCHOLOGY", isActive: true });
    mockPostCount.mockResolvedValue(0);
    mockScanContent.mockResolvedValue([]);
    mockPostCreate.mockResolvedValue({
      id: "p3", authorId: "mod1", anonymousId: "匿名用户_MOD1",
      author: { id: "mod1", nickname: "版主", avatar: null }, board: { zone: "PSYCHOLOGY" },
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", undefined, {
      title: "心理帖子", content: "内容", boardId: "clxxxxxxxxxxxxxxxxxx003",
    }), { params: {} });
    expect(res.status).toBe(201);
  });
});
