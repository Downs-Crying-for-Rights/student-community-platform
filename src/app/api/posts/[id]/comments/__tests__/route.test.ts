import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockPostFindUnique = vi.fn();
const mockPostUpdate = vi.fn();
const mockCommentFindMany = vi.fn();
const mockCommentFindUnique = vi.fn();
const mockCommentCreate = vi.fn();
const mockCommentCount = vi.fn();
const mockNotificationCreate = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    post: {
      findUnique: async (...args: unknown[]) => {
        const post = await mockPostFindUnique(...args);
        return post && { visibility: "PUBLIC", board: { zone: "PUBLIC" }, ...post };
      },
      update: (...args: unknown[]) => mockPostUpdate(...args),
    },
    comment: {
      findMany: (...args: unknown[]) => mockCommentFindMany(...args),
      findUnique: (...args: unknown[]) => mockCommentFindUnique(...args),
      create: (...args: unknown[]) => mockCommentCreate(...args),
      count: (...args: unknown[]) => mockCommentCount(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
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
  AuditTargetType: { COMMENT: "COMMENT" },
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

function makeRequest(method: string, body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/posts/p1/comments";
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init as any);
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== GET Tests ====================

describe("GET /api/posts/[id]/comments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../../comments/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当帖子不存在", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue(null);
    const { GET } = await import("../../comments/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回评论列表和总数", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1" });
    mockCommentFindMany.mockResolvedValue([
      {
        id: "c1",
        content: "评论1",
        author: { id: "user1", nickname: "用户1", avatar: null },
        replies: [],
      },
    ]);
    mockCommentCount.mockResolvedValue(1);

    const { GET } = await import("../../comments/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.comments).toHaveLength(1);
    expect(data.total).toBe(1);
  });

  it("无 psychAccess 不得读取心理评论", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", authorId: "author1", visibility: "PUBLIC", board: { zone: "PSYCHOLOGY" } });
    mockUserFindUnique.mockResolvedValue({ psychAccess: false, dcrAccess: false });

    const { GET } = await import("../../comments/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(403);
    expect(mockCommentFindMany).not.toHaveBeenCalled();
  });

  it("非作者不得读取 MODS_ONLY 帖子的评论", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", authorId: "author1", visibility: "MODS_ONLY", board: { zone: "PUBLIC" } });
    const { GET } = await import("../../comments/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(403);
    expect(mockCommentFindMany).not.toHaveBeenCalled();
  });

  it("心理评论列表应递归隐藏真实作者身份", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({ id: "p1", authorId: "author1", visibility: "PUBLIC", board: { zone: "PSYCHOLOGY" } });
    mockUserFindUnique.mockResolvedValue({ psychAccess: true, dcrAccess: false });
    mockCommentFindMany.mockResolvedValue([{
      id: "c1", authorId: "real-1", anonymousId: "匿名用户_AAAA",
      author: { id: "real-1", nickname: "真名", avatar: "real.png" },
      replies: [{ id: "c2", authorId: "real-2", anonymousId: "匿名用户_BBBB", author: { id: "real-2", nickname: "真名2", avatar: null }, replies: [] }],
    }]);
    mockCommentCount.mockResolvedValue(2);

    const { GET } = await import("../../comments/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    const data = await res.json();
    expect(data.comments[0].authorId).toBe("匿名用户_AAAA");
    expect(data.comments[0].author.nickname).toBe("匿名用户_AAAA");
    expect(data.comments[0].replies[0].authorId).toBe("匿名用户_BBBB");
  });
});

// ==================== POST Tests ====================

describe("POST /api/posts/[id]/comments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../../comments/route");
    const res = await POST(makeRequest("POST", { content: "测试" }), { params: { id: "p1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../../comments/route");
    const res = await POST(makeRequest("POST", { content: "" }), { params: { id: "p1" } });
    expect(res.status).toBe(400);
  });

  it("应返回 404 当帖子不存在", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue(null);
    const { POST } = await import("../../comments/route");
    const res = await POST(makeRequest("POST", { content: "测试评论" }), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 403 当帖子处于待审核状态", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PENDING",
      authorId: "author1",
      title: "待审核帖子",
    });

    const { POST } = await import("../../comments/route");
    const res = await POST(makeRequest("POST", { content: "测试评论" }), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("待审核帖子禁止评论");
  });

  it("应返回 400 当评论内容包含敏感词", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "author1",
      title: "测试帖子",
    });
    mockScanContent.mockResolvedValue([
      { word: "敏感词", category: "PROFANITY", startIndex: 0, endIndex: 3 },
    ]);

    const { POST } = await import("../../comments/route");
    const res = await POST(makeRequest("POST", { content: "敏感词内容" }), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("评论内容包含敏感词");
  });

  it("应成功创建顶级评论", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "author1",
      title: "测试帖子",
    });
    mockScanContent.mockResolvedValue([]);
    mockCommentCreate.mockResolvedValue({
      id: "c1",
      content: "好帖子",
      authorId: "user1",
      postId: "p1",
      parentId: null,
      author: { id: "user1", nickname: "用户1", avatar: null },
    });
    mockPostUpdate.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../../comments/route");
    const res = await POST(makeRequest("POST", { content: "好帖子" }), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.comment.content).toBe("好帖子");
    // Should create notification since commenter != post author
    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it("不应为帖子作者自己评论创建通知", async () => {
    setSession("author1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "author1",
      title: "测试帖子",
    });
    mockScanContent.mockResolvedValue([]);
    mockCommentCreate.mockResolvedValue({
      id: "c1",
      content: "自评",
      authorId: "author1",
      postId: "p1",
      parentId: null,
      author: { id: "author1", nickname: "作者", avatar: null },
    });
    mockPostUpdate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../../comments/route");
    const res = await POST(makeRequest("POST", { content: "自评" }), { params: { id: "p1" } });

    expect(res.status).toBe(201);
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });


  it("应返回 404 当父评论不存在", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "author1",
      title: "测试帖子",
    });
    mockCommentFindUnique.mockResolvedValue(null);

    const { POST } = await import("../../comments/route");
    const res = await POST(
      makeRequest("POST", { content: "回复", parentId: "cm9xxxxxxxxxxxxxxxxxx001" }),
      { params: { id: "p1" } },
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("父评论不存在");
  });

  it("应返回 400 当嵌套深度超过 3 层", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "author1",
      title: "测试帖子",
    });

    const parentCuid = "cm9xxxxxxxxxxxxxxxxxx003";
    // Parent comment exists at depth 2 (grandchild of top-level)
    // First call: check parent exists
    mockCommentFindUnique.mockResolvedValueOnce({
      id: parentCuid,
      postId: "p1",
      isDeleted: false,
      parentId: "cm9xxxxxxxxxxxxxxxxxx002",
    });
    // getCommentDepth traversal: c3 -> c2 -> c1 -> null
    mockCommentFindUnique.mockResolvedValueOnce({ parentId: "cm9xxxxxxxxxxxxxxxxxx002" });
    mockCommentFindUnique.mockResolvedValueOnce({ parentId: "cm9xxxxxxxxxxxxxxxxxx001" });
    mockCommentFindUnique.mockResolvedValueOnce({ parentId: null });

    const { POST } = await import("../../comments/route");
    const res = await POST(
      makeRequest("POST", { content: "深层回复", parentId: parentCuid }),
      { params: { id: "p1" } },
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("评论嵌套层数已达上限");
  });

  it("应允许在深度 1 的评论下回复（第 3 层）", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "author1",
      title: "测试帖子",
    });

    const parentCuid = "cm9xxxxxxxxxxxxxxxxxx002";
    // Parent at depth 1 (reply to top-level)
    mockCommentFindUnique.mockResolvedValueOnce({
      id: parentCuid,
      postId: "p1",
      isDeleted: false,
      parentId: "cm9xxxxxxxxxxxxxxxxxx001",
    });
    // getCommentDepth: c2 -> c1 -> null => depth = 1
    mockCommentFindUnique.mockResolvedValueOnce({ parentId: "cm9xxxxxxxxxxxxxxxxxx001" });
    mockCommentFindUnique.mockResolvedValueOnce({ parentId: null });

    mockScanContent.mockResolvedValue([]);
    mockCommentCreate.mockResolvedValue({
      id: "cm9xxxxxxxxxxxxxxxxxx003",
      content: "第三层回复",
      authorId: "user1",
      postId: "p1",
      parentId: parentCuid,
      author: { id: "user1", nickname: "用户1", avatar: null },
    });
    mockPostUpdate.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../../comments/route");
    const res = await POST(
      makeRequest("POST", { content: "第三层回复", parentId: parentCuid }),
      { params: { id: "p1" } },
    );

    expect(res.status).toBe(201);
  });

  it("心理评论应强制匿名写入并匿名返回", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1", status: "PUBLISHED", authorId: "author1", title: "心理帖子",
      visibility: "PUBLIC", board: { zone: "PSYCHOLOGY" },
    });
    mockUserFindUnique.mockResolvedValue({ psychAccess: true, dcrAccess: false });
    mockScanContent.mockResolvedValue([]);
    mockCommentCreate.mockResolvedValue({
      id: "c1", content: "评论", authorId: "user1", anonymousId: "匿名用户_TEST",
      author: { id: "user1", nickname: "真实姓名", avatar: "real.png" }, replies: [],
    });
    mockPostUpdate.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../../comments/route");
    const res = await POST(makeRequest("POST", { content: "评论" }), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(mockCommentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isAnonymous: true, anonymousId: expect.stringContaining("匿名用户_") }),
    }));
    expect(data.comment.authorId).toBe("匿名用户_TEST");
    expect(data.comment.author).toEqual({ id: "匿名用户_TEST", nickname: "匿名用户_TEST", avatar: null });
  });
});
