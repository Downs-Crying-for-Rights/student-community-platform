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

vi.mock("@/lib/prisma", () => ({
  default: {
    post: {
      findUnique: (...args: unknown[]) => mockPostFindUnique(...args),
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
  return new NextRequest(url, init);
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
});
