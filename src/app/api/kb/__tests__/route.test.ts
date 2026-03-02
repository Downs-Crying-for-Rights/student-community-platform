import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockArticleCreate = vi.fn();
const mockArticleFindMany = vi.fn();
const mockArticleCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    knowledgeArticle: {
      create: (...args: unknown[]) => mockArticleCreate(...args),
      findMany: (...args: unknown[]) => mockArticleFindMany(...args),
      count: (...args: unknown[]) => mockArticleCount(...args),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makePostRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/kb", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/kb");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("POST /api/kb", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ title: "测试", content: "内容", category: "政策" }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户尝试创建文章", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ title: "测试", content: "内容", category: "政策" }), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("admin1", "ADMIN");
    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ title: "" }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("Admin 应成功创建文章", async () => {
    setSession("admin1", "ADMIN");
    const now = new Date();
    mockArticleCreate.mockResolvedValue({
      id: "art1",
      title: "政策解读",
      content: "文章正文内容",
      category: "政策学习",
      visibility: "PUBLIC",
      isPublished: true,
      createdAt: now,
      updatedAt: now,
    });

    const { POST } = await import("../route");
    const res = await POST(
      makePostRequest({
        title: "政策解读",
        content: "文章正文内容",
        category: "政策学习",
        visibility: "PUBLIC",
        isPublished: true,
      }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.article.title).toBe("政策解读");
    expect(data.article.visibility).toBe("PUBLIC");
  });

  it("Admin 应成功创建 DCR_ONLY 文章", async () => {
    setSession("admin1", "ADMIN");
    mockArticleCreate.mockResolvedValue({
      id: "art2",
      title: "DCR 专属指南",
      content: "DCR 内容",
      category: "合规渠道",
      visibility: "DCR_ONLY",
      isPublished: false,
    });

    const { POST } = await import("../route");
    const res = await POST(
      makePostRequest({
        title: "DCR 专属指南",
        content: "DCR 内容",
        category: "合规渠道",
        visibility: "DCR_ONLY",
      }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.article.visibility).toBe("DCR_ONLY");
  });
});

describe("GET /api/kb", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("普通用户应只看到 PUBLIC 文章", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockArticleFindMany.mockResolvedValue([
      { id: "art1", title: "公开文章", visibility: "PUBLIC" },
    ]);
    mockArticleCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.articles).toHaveLength(1);
    expect(data.total).toBe(1);

    // Verify the where clause only includes PUBLIC visibility
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.where.visibility.in).toEqual(["PUBLIC"]);
  });

  it("DCR 用户应看到 PUBLIC 和 DCR_ONLY 文章", async () => {
    setSession("user2", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });

    expect(res.status).toBe(200);
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.where.visibility.in).toEqual(["PUBLIC", "DCR_ONLY"]);
  });

  it("Admin 应看到所有文章", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });

    expect(res.status).toBe(200);
    // Admin should not trigger user.findUnique for visibility check
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.where.visibility.in).toEqual(["PUBLIC", "DCR_ONLY"]);
  });

  it("应支持按分类筛选", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest({ category: "政策学习" }), { params: {} });

    expect(res.status).toBe(200);
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.where.category).toBe("政策学习");
  });

  it("Admin 使用 all=true 时应跳过 isPublished 过滤并返回 isPublished 字段", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindMany.mockResolvedValue([
      { id: "art1", title: "已发布", isPublished: true },
      { id: "art2", title: "草稿", isPublished: false },
    ]);
    mockArticleCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest({ all: "true" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.articles).toHaveLength(2);

    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    // Should NOT have isPublished in where clause
    expect(findManyCall.where.isPublished).toBeUndefined();
    // Should include isPublished in select
    expect(findManyCall.select.isPublished).toBe(true);
  });

  it("非 Admin 用户使用 all=true 时仍应过滤 isPublished", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest({ all: "true" }), { params: {} });

    expect(res.status).toBe(200);
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    // Non-admin should still have isPublished filter
    expect(findManyCall.where.isPublished).toBe(true);
  });

  it("Admin 不传 all 参数时仍应过滤 isPublished", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });

    expect(res.status).toBe(200);
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    // Without all=true, should still filter by isPublished
    expect(findManyCall.where.isPublished).toBe(true);
  });
});
