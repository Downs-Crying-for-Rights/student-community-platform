import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockCommentFindUnique = vi.fn();
const mockCommentUpdate = vi.fn();
const mockPostUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    comment: {
      findUnique: (...args: unknown[]) => mockCommentFindUnique(...args),
      update: (...args: unknown[]) => mockCommentUpdate(...args),
    },
    post: {
      update: (...args: unknown[]) => mockPostUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
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
  const url = "http://localhost:3000/api/comments/c1";
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

// ==================== PATCH Tests ====================

describe("PATCH /api/comments/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { content: "新内容" }), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当评论不存在", async () => {
    setSession("user1", "USER");
    mockCommentFindUnique.mockResolvedValue(null);
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { content: "新内容" }), { params: { id: "c1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 404 当评论已删除", async () => {
    setSession("user1", "USER");
    mockCommentFindUnique.mockResolvedValue({ id: "c1", authorId: "user1", isDeleted: true });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { content: "新内容" }), { params: { id: "c1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 403 当编辑他人评论", async () => {
    setSession("user2", "USER");
    mockCommentFindUnique.mockResolvedValue({ id: "c1", authorId: "user1", isDeleted: false });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { content: "新内容" }), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });

  it("应返回 400 当编辑内容包含敏感词", async () => {
    setSession("user1", "USER");
    mockCommentFindUnique.mockResolvedValue({ id: "c1", authorId: "user1", isDeleted: false });
    mockScanContent.mockResolvedValue([
      { word: "敏感词", category: "PROFANITY", startIndex: 0, endIndex: 3 },
    ]);

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { content: "敏感词内容" }), { params: { id: "c1" } });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("评论内容包含敏感词");
  });

  it("应成功编辑自己的评论", async () => {
    setSession("user1", "USER");
    mockCommentFindUnique.mockResolvedValue({ id: "c1", authorId: "user1", isDeleted: false });
    mockScanContent.mockResolvedValue([]);
    mockCommentUpdate.mockResolvedValue({
      id: "c1",
      content: "更新后的内容",
      author: { id: "user1", nickname: "用户1", avatar: null },
    });
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makeRequest("PATCH", { content: "更新后的内容" }), { params: { id: "c1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.comment.content).toBe("更新后的内容");
  });
});

// ==================== DELETE Tests ====================

describe("DELETE /api/comments/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当评论不存在", async () => {
    setSession("user1", "USER");
    mockCommentFindUnique.mockResolvedValue(null);
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "c1" } });
    expect(res.status).toBe(404);
  });

  it("应返回 400 当评论已被删除", async () => {
    setSession("user1", "USER");
    mockCommentFindUnique.mockResolvedValue({ id: "c1", authorId: "user1", isDeleted: true, postId: "p1" });
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "c1" } });
    expect(res.status).toBe(400);
  });

  it("应返回 403 当非作者且非版主删除评论", async () => {
    setSession("user2", "USER");
    mockCommentFindUnique.mockResolvedValue({ id: "c1", authorId: "user1", isDeleted: false, postId: "p1" });
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });

  it("应允许作者软删除自己的评论", async () => {
    setSession("user1", "USER");
    mockCommentFindUnique.mockResolvedValue({ id: "c1", authorId: "user1", isDeleted: false, postId: "p1" });
    mockTransaction.mockResolvedValue([{}, {}]);
    mockLogAudit.mockResolvedValue({});

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "c1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe("评论已删除");
  });

  it("应允许版主删除任何评论", async () => {
    setSession("mod1", "MODERATOR");
    mockCommentFindUnique.mockResolvedValue({ id: "c1", authorId: "user1", isDeleted: false, postId: "p1" });
    mockTransaction.mockResolvedValue([{}, {}]);
    mockLogAudit.mockResolvedValue({});

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(makeRequest("DELETE"), { params: { id: "c1" } });

    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      "mod1",
      "DELETE_COMMENT",
      "COMMENT",
      "c1",
      { deletedBy: "moderator" },
    );
  });
});
