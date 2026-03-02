import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockArticleFindUnique = vi.fn();
const mockArticleUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    knowledgeArticle: {
      findUnique: (...args: unknown[]) => mockArticleFindUnique(...args),
      update: (...args: unknown[]) => mockArticleUpdate(...args),
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

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/kb/${id}`, { method: "GET" });
}

function makePatchRequest(id: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/kb/${id}`, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("GET /api/kb/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("art1"), { params: { id: "art1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当文章不存在", async () => {
    setSession("user1", "USER");
    mockArticleFindUnique.mockResolvedValue(null);

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("nonexistent"), { params: { id: "nonexistent" } });
    expect(res.status).toBe(404);
  });

  it("应返回 404 当文章未发布且用户非 Admin", async () => {
    setSession("user1", "USER");
    mockArticleFindUnique.mockResolvedValue({
      id: "art1",
      title: "草稿文章",
      isPublished: false,
      visibility: "PUBLIC",
    });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("art1"), { params: { id: "art1" } });
    expect(res.status).toBe(404);
  });

  it("Admin 应能查看未发布文章", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindUnique.mockResolvedValue({
      id: "art1",
      title: "草稿文章",
      isPublished: false,
      visibility: "PUBLIC",
    });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("art1"), { params: { id: "art1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.article.title).toBe("草稿文章");
  });

  it("应返回 403 当普通用户查看 DCR_ONLY 文章且无 DCR 权限", async () => {
    setSession("user1", "USER");
    mockArticleFindUnique.mockResolvedValue({
      id: "art1",
      title: "DCR 文章",
      isPublished: true,
      visibility: "DCR_ONLY",
    });
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("art1"), { params: { id: "art1" } });
    expect(res.status).toBe(403);
  });

  it("DCR 用户应能查看 DCR_ONLY 文章", async () => {
    setSession("user2", "USER");
    mockArticleFindUnique.mockResolvedValue({
      id: "art1",
      title: "DCR 文章",
      content: "DCR 内容",
      isPublished: true,
      visibility: "DCR_ONLY",
    });
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("art1"), { params: { id: "art1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.article.title).toBe("DCR 文章");
  });

  it("所有用户应能查看 PUBLIC 已发布文章", async () => {
    setSession("user1", "USER");
    mockArticleFindUnique.mockResolvedValue({
      id: "art1",
      title: "公开文章",
      content: "公开内容",
      isPublished: true,
      visibility: "PUBLIC",
    });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("art1"), { params: { id: "art1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.article.title).toBe("公开文章");
  });
});

describe("PATCH /api/kb/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makePatchRequest("art1", { title: "新标题" }), { params: { id: "art1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户尝试编辑", async () => {
    setSession("user1", "USER");
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makePatchRequest("art1", { title: "新标题" }), { params: { id: "art1" } });
    expect(res.status).toBe(403);
  });

  it("应返回 404 当文章不存在", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makePatchRequest("nonexistent", { title: "新标题" }), { params: { id: "nonexistent" } });
    expect(res.status).toBe(404);
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindUnique.mockResolvedValue({ id: "art1" });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(makePatchRequest("art1", { title: "" }), { params: { id: "art1" } });
    expect(res.status).toBe(400);
  });

  it("Admin 应成功编辑文章", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindUnique.mockResolvedValue({ id: "art1", title: "旧标题" });
    mockArticleUpdate.mockResolvedValue({
      id: "art1",
      title: "新标题",
      content: "更新内容",
      category: "政策学习",
      visibility: "PUBLIC",
      isPublished: true,
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("art1", { title: "新标题", content: "更新内容" }),
      { params: { id: "art1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.article.title).toBe("新标题");
  });

  it("Admin 应能更新文章可见性", async () => {
    setSession("admin1", "ADMIN");
    mockArticleFindUnique.mockResolvedValue({ id: "art1" });
    mockArticleUpdate.mockResolvedValue({
      id: "art1",
      visibility: "DCR_ONLY",
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("art1", { visibility: "DCR_ONLY" }),
      { params: { id: "art1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.article.visibility).toBe("DCR_ONLY");
  });
});
