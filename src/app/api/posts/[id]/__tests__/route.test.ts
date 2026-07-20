import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockPostFindUnique = vi.fn();
const mockPostUpdate = vi.fn();
const mockPostEditHistoryCreate = vi.fn();
const mockPostTagDeleteMany = vi.fn();
const mockPostTagCreateMany = vi.fn();
const mockRevisionCreate = vi.fn();
const mockRevisionUpdateMany = vi.fn();
const mockTagCount = vi.fn();
const mockLikeFindUnique = vi.fn();
const mockBookmarkFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    post: {
      findUnique: async (...args: unknown[]) => {
        const post = await mockPostFindUnique(...args);
        return post && { visibility: "PUBLIC", board: { zone: "PUBLIC" }, ...post };
      },
      update: (...args: unknown[]) => mockPostUpdate(...args),
    },
    postEditHistory: {
      create: (...args: unknown[]) => mockPostEditHistoryCreate(...args),
    },
    postTag: {
      deleteMany: (...args: unknown[]) => mockPostTagDeleteMany(...args),
      createMany: (...args: unknown[]) => mockPostTagCreateMany(...args),
    },
    postRevision: {
      create: (...args: unknown[]) => mockRevisionCreate(...args),
      updateMany: (...args: unknown[]) => mockRevisionUpdateMany(...args),
    },
    tag: { count: (...args: unknown[]) => mockTagCount(...args) },
    like: { findUnique: (...args: unknown[]) => mockLikeFindUnique(...args) },
    bookmark: { findUnique: (...args: unknown[]) => mockBookmarkFindUnique(...args) },
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      postRevision: {
        create: (...args: unknown[]) => mockRevisionCreate(...args),
        updateMany: (...args: unknown[]) => mockRevisionUpdateMany(...args),
      },
      postEditHistory: { create: (...args: unknown[]) => mockPostEditHistoryCreate(...args) },
      postTag: {
        deleteMany: (...args: unknown[]) => mockPostTagDeleteMany(...args),
        createMany: (...args: unknown[]) => mockPostTagCreateMany(...args),
      },
      post: { update: (...args: unknown[]) => mockPostUpdate(...args) },
      auditLog: { create: vi.fn() },
    }),
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

function makeRequest(method: string, body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/posts/p1";
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

describe("GET /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTagCount.mockResolvedValue(0);
    mockRevisionUpdateMany.mockResolvedValue({ count: 0 });
    mockRevisionCreate.mockResolvedValue({ id: "revision1", status: "PENDING" });
    mockLikeFindUnique.mockResolvedValue(null);
    mockBookmarkFindUnique.mockResolvedValue(null);
  });

  it("未登录用户应可查看公开且已发布的帖子", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      title: "公开帖子",
      status: "PUBLISHED",
      authorId: "user1",
      author: { id: "user1", nickname: "用户1", avatar: null, isShadowBanned: false },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
      case_: null,
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.post.id).toBe("p1");
    expect(data.post.author.isShadowBanned).toBeUndefined();
    expect(data.post.isLiked).toBe(false);
    expect(data.post.isBookmarked).toBe(false);
    expect(mockLikeFindUnique).not.toHaveBeenCalled();
    expect(mockBookmarkFindUnique).not.toHaveBeenCalled();
  });

  it("未登录用户不可查看非公开区帖子", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "user1",
      author: { id: "user1", nickname: "用户1", avatar: null, isShadowBanned: false },
      board: { id: "b1", name: "DCR", zone: "DCR" },
      tags: [],
      case_: null,
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 404 当帖子不存在", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue(null);

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回帖子详情", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      title: "测试帖子",
      status: "PUBLISHED",
      authorId: "user1",
      author: { id: "user1", nickname: "用户1", avatar: null, isShadowBanned: false },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.post.id).toBe("p1");
    // isShadowBanned should be stripped from response
    expect(data.post.author.isShadowBanned).toBeUndefined();
  });

  it("应返回当前用户的点赞和收藏状态", async () => {
    setSession("user2", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      title: "测试帖子",
      status: "PUBLISHED",
      authorId: "user1",
      author: { id: "user1", nickname: "用户1", avatar: null, isShadowBanned: false },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
    });
    mockLikeFindUnique.mockResolvedValue({ userId: "user2", postId: "p1" });
    mockBookmarkFindUnique.mockResolvedValue({ userId: "user2", postId: "p1" });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.post).toMatchObject({ isLiked: true, isBookmarked: true });
    expect(mockLikeFindUnique).toHaveBeenCalledWith({
      where: { userId_postId: { userId: "user2", postId: "p1" } },
    });
    expect(mockBookmarkFindUnique).toHaveBeenCalledWith({
      where: { userId_postId: { userId: "user2", postId: "p1" } },
    });
  });

  it("应返回 404 当帖子已删除且非版主", async () => {
    setSession("user2", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "DELETED",
      authorId: "user1",
      author: { id: "user1", nickname: "用户1", avatar: null, isShadowBanned: false },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 404 当 shadow banned 用户的帖子被非作者查看", async () => {
    setSession("user2", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "user1",
      author: { id: "user1", nickname: "用户1", avatar: null, isShadowBanned: true },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应允许 shadow banned 用户查看自己的帖子", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      authorId: "user1",
      author: { id: "user1", nickname: "用户1", avatar: null, isShadowBanned: true },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(200);
  });

  it("应允许版主查看已删除帖子", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "DELETED",
      authorId: "user1",
      author: { id: "user1", nickname: "用户1", avatar: null, isShadowBanned: false },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(200);
  });

  it("心理帖子响应应隐藏真实作者身份，包括对版主", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      authorId: "real-user",
      anonymousId: "匿名用户_AB12",
      author: { id: "real-user", nickname: "真实姓名", avatar: "real.png", isShadowBanned: false },
      board: { id: "b1", name: "心理", zone: "PSYCHOLOGY" },
      tags: [],
      case_: null,
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.post.authorId).toBe("匿名用户_AB12");
    expect(data.post.author).toEqual({ id: "匿名用户_AB12", nickname: "匿名用户_AB12", avatar: null, isVerified: false });
  });

  it("心理区 MATCHED 帖子即使作者也不可读取", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1", status: "PUBLISHED", visibility: "MATCHED", authorId: "user1",
      author: { id: "user1", nickname: "用户", avatar: null, isShadowBanned: false },
      board: { zone: "PSYCHOLOGY" }, tags: [], case_: null,
    });

    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(403);
  });
});


// ==================== PATCH Tests ====================

describe("PATCH /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTagCount.mockResolvedValue(0);
    mockRevisionUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { title: "新标题" }), { params: { id: "p1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当帖子不存在", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { title: "新标题" }), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 403 当编辑他人帖子", async () => {
    setSession("user2", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      title: "原标题",
      content: "原内容",
      status: "PUBLISHED",
    });

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { title: "新标题" }), { params: { id: "p1" } });
    expect(res.status).toBe(403);
  });

  it("应返回 400 当编辑已删除帖子", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      title: "原标题",
      content: "原内容",
      status: "DELETED",
    });

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { title: "新标题" }), { params: { id: "p1" } });
    expect(res.status).toBe(400);
  });

  it("已发布帖子编辑应创建待审修订并保持线上版本不变", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      title: "原标题",
      content: "原内容",
      status: "PUBLISHED",
    });
    mockScanContent.mockResolvedValue([]);
    mockLogAudit.mockResolvedValue({});
    mockRevisionCreate.mockResolvedValue({ id: "revision1", title: "新标题", status: "PENDING" });

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { title: "新标题" }), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.post.title).toBe("原标题");
    expect(data.liveVersionUnchanged).toBe(true);
    expect(data.reviewStatus).toBe("PENDING");
    expect(mockRevisionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ postId: "p1", title: "新标题", editorId: "user1" }),
    }));
    expect(mockPostUpdate).not.toHaveBeenCalled();
    expect(mockPostEditHistoryCreate).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      "user1",
      "POST_REVISION_SUBMIT",
      "POST",
      "p1",
      expect.objectContaining({ revisionId: "revision1" }),
      undefined,
      expect.objectContaining({ postRevision: expect.any(Object) }),
    );
  });

  it("非已发布帖子编辑应直接更新并进入待审核状态", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      title: "原标题",
      content: "原内容",
      summary: null,
      images: [],
      visibility: "PUBLIC",
      status: "DRAFT",
      tags: [],
      board: { zone: "PUBLIC" },
    });
    mockScanContent.mockResolvedValue([]);
    mockPostUpdate.mockResolvedValue({
      id: "p1",
      title: "新标题",
      status: "PENDING",
      board: { zone: "PUBLIC" },
    });

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { title: "新标题" }), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.liveVersionUnchanged).toBe(false);
    expect(data.reviewStatus).toBe("PENDING");
    expect(mockPostUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "p1" },
      data: expect.objectContaining({ title: "新标题", status: "PENDING" }),
    }));
    expect(mockRevisionCreate).not.toHaveBeenCalled();
  });

  it("应拒绝没有任何修改字段的请求", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      title: "原标题",
      content: "原内容",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      board: { zone: "PUBLIC" },
    });

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", {}), { params: { id: "p1" } });

    expect(res.status).toBe(400);
    expect(mockPostUpdate).not.toHaveBeenCalled();
  });

  it("应返回 400 当编辑内容包含敏感词", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      title: "原标题",
      content: "原内容",
      status: "PUBLISHED",
    });
    mockScanContent.mockResolvedValue([
      { word: "敏感词", category: "PROFANITY", startIndex: 0, endIndex: 3 },
    ]);

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { title: "敏感词标题" }), { params: { id: "p1" } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("内容包含敏感词");
  });
});

// ==================== DELETE Tests ====================

describe("DELETE /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { DELETE } = await import("../../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "p1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当帖子不存在", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue(null);

    const { DELETE } = await import("../../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "p1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 400 当帖子已被删除", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      status: "DELETED",
    });

    const { DELETE } = await import("../../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "p1" } });
    expect(res.status).toBe(400);
  });

  it("应返回 403 当非作者且非版主删除帖子", async () => {
    setSession("user2", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      status: "PUBLISHED",
    });

    const { DELETE } = await import("../../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "p1" } });
    expect(res.status).toBe(403);
  });

  it("应允许作者软删除自己的帖子", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      status: "PUBLISHED",
    });
    mockPostUpdate.mockResolvedValue({ id: "p1", status: "DELETED" });
    mockLogAudit.mockResolvedValue({});

    const { DELETE } = await import("../../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe("帖子已删除");
    expect(mockPostUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "DELETED" },
    });
  });

  it("应允许版主删除任何帖子", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      status: "PUBLISHED",
    });
    mockPostUpdate.mockResolvedValue({ id: "p1", status: "DELETED" });
    mockLogAudit.mockResolvedValue({});

    const { DELETE } = await import("../../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "p1" } });

    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      "mod1",
      "DELETE_POST",
      "POST",
      "p1",
      { deletedBy: "moderator" },
    );
  });
});
