import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockArticleFindMany = vi.fn();
const mockArticleCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    knowledgeArticle: {
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

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/kb/search");
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

describe("GET /api/kb/search", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../search/route");
    const res = await GET(makeGetRequest({ q: "政策" }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 400 当缺少搜索关键词", async () => {
    setSession("user1", "USER");
    const { GET } = await import("../search/route");
    const res = await GET(makeGetRequest(), { params: {} });
    expect(res.status).toBe(400);
  });

  it("应按标题和内容搜索文章", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockArticleFindMany.mockResolvedValue([
      { id: "art1", title: "政策解读", category: "政策学习", visibility: "PUBLIC" },
    ]);
    mockArticleCount.mockResolvedValue(1);

    const { GET } = await import("../search/route");
    const res = await GET(makeGetRequest({ q: "政策" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.articles).toHaveLength(1);
    expect(data.total).toBe(1);

    // Verify search uses OR on title and content
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.where.OR).toEqual([
      { title: { contains: "政策", mode: "insensitive" } },
      { content: { contains: "政策", mode: "insensitive" } },
    ]);
  });

  it("普通用户搜索应只返回 PUBLIC 文章", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(0);

    const { GET } = await import("../search/route");
    const res = await GET(makeGetRequest({ q: "测试" }), { params: {} });

    expect(res.status).toBe(200);
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.where.visibility.in).toEqual(["PUBLIC"]);
  });

  it("DCR 用户搜索应返回 PUBLIC 和 DCR_ONLY 文章", async () => {
    setSession("user2", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(0);

    const { GET } = await import("../search/route");
    const res = await GET(makeGetRequest({ q: "测试" }), { params: {} });

    expect(res.status).toBe(200);
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.where.visibility.in).toEqual(["PUBLIC", "DCR_ONLY"]);
  });

  it("Admin 搜索应返回所有可见性文章", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(0);

    const { GET } = await import("../search/route");
    const res = await GET(makeGetRequest({ q: "测试" }), { params: {} });

    expect(res.status).toBe(200);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.where.visibility.in).toEqual(["PUBLIC", "DCR_ONLY"]);
  });

  it("应支持分页参数", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockArticleFindMany.mockResolvedValue([]);
    mockArticleCount.mockResolvedValue(25);

    const { GET } = await import("../search/route");
    const res = await GET(makeGetRequest({ q: "测试", page: "2", pageSize: "10" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(10);

    const findManyCall = mockArticleFindMany.mock.calls[0][0];
    expect(findManyCall.skip).toBe(10);
    expect(findManyCall.take).toBe(10);
  });
});
