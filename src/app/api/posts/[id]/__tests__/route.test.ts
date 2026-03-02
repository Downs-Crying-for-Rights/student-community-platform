import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockPostFindUnique = vi.fn();
const mockPostUpdate = vi.fn();
const mockPostEditHistoryCreate = vi.fn();
const mockPostTagDeleteMany = vi.fn();
const mockPostTagCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    post: {
      findUnique: (...args: unknown[]) => mockPostFindUnique(...args),
      update: (...args: unknown[]) => mockPostUpdate(...args),
    },
    postEditHistory: {
      create: (...args: unknown[]) => mockPostEditHistoryCreate(...args),
    },
    postTag: {
      deleteMany: (...args: unknown[]) => mockPostTagDeleteMany(...args),
      createMany: (...args: unknown[]) => mockPostTagCreateMany(...args),
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

function makeRequest(method: string, body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/posts/p1";
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

describe("GET /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../../[id]/route");
    const res = await GET(makeRequest("GET"), { params: { id: "p1" } });
    expect(res.status).toBe(401);
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
});


// ==================== PATCH Tests ====================

describe("PATCH /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("应成功编辑帖子并保存编辑历史", async () => {
    setSession("user1", "USER");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      authorId: "user1",
      title: "原标题",
      content: "原内容",
      status: "PUBLISHED",
    });
    mockScanContent.mockResolvedValue([]);
    mockPostEditHistoryCreate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const updatedPost = {
      id: "p1",
      title: "新标题",
      content: "原内容",
      author: { id: "user1", nickname: "用户1", avatar: null },
      board: { id: "b1", name: "娱乐", zone: "PUBLIC" },
      tags: [],
    };
    mockPostUpdate.mockResolvedValue(updatedPost);

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { title: "新标题" }), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.post.title).toBe("新标题");

    // Should save edit history
    expect(mockPostEditHistoryCreate).toHaveBeenCalledWith({
      data: {
        postId: "p1",
        oldTitle: "原标题",
        oldContent: "原内容",
      },
    });
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
