import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fc from "fast-check";

// ==================== Mocks ====================

const mockArticleFindUnique = vi.fn();
const mockArticleUpdate = vi.fn();
const mockArticleDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    knowledgeArticle: {
      findUnique: (...args: unknown[]) => mockArticleFindUnique(...args),
      update: (...args: unknown[]) => mockArticleUpdate(...args),
      delete: (...args: unknown[]) => mockArticleDelete(...args),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Generators ====================

/** Non-ADMIN roles that should get 403 */
const nonAdminRoles = ["USER", "TRUSTED_USER", "DCR_HELPER", "MODERATOR", "PSYCH_COUNSELOR"] as const;

/** Generate a title that exceeds 200 characters */
function arbOverlongTitle() {
  return fc.integer({ min: 201, max: 300 }).map((len) => "标".repeat(len));
}

/** Generate content that exceeds 50000 characters */
function arbOverlongContent() {
  return fc.integer({ min: 50001, max: 51000 }).map((len) => "内".repeat(len));
}

/** Generate a valid title (1-200 chars) */
function arbValidTitle() {
  return fc.integer({ min: 1, max: 200 }).map((len) => "标".repeat(len));
}

/** Generate valid content (1-50000 chars, keep small for speed) */
function arbValidContent() {
  return fc.integer({ min: 1, max: 100 }).map((len) => "内".repeat(len));
}

// ==================== Helpers ====================

function makePatchRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/kb/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/kb/${id}`, {
    method: "DELETE",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const makeContext = (id: string) => ({ params: { id } } as never);

// ==================== Property 15: 知识库文章更新校验 ====================
// Feature: dcr-complete-ui, Property 15: 知识库文章更新校验
// **Validates: Requirements 7.1, 7.5**

describe("Property 15: 知识库文章更新校验 — title > 200 or content > 50000 returns 400", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("title 超过 200 字符返回 400", async () => {
    await fc.assert(
      fc.asyncProperty(arbOverlongTitle(), async (title) => {
        vi.clearAllMocks();

        setSession("admin1", "ADMIN");
        mockArticleFindUnique.mockResolvedValue({ id: "art1" });

        const { PATCH } = await import("../../[id]/route");
        const res = await PATCH(
          makePatchRequest("art1", { title }),
          makeContext("art1"),
        );
        expect(res.status).toBe(400);
      }),
      { numRuns: 100 },
    );
  });

  it("content 超过 50000 字符返回 400", async () => {
    await fc.assert(
      fc.asyncProperty(arbOverlongContent(), async (content) => {
        vi.clearAllMocks();

        setSession("admin1", "ADMIN");
        mockArticleFindUnique.mockResolvedValue({ id: "art1" });

        const { PATCH } = await import("../../[id]/route");
        const res = await PATCH(
          makePatchRequest("art1", { content }),
          makeContext("art1"),
        );
        expect(res.status).toBe(400);
      }),
      { numRuns: 100 },
    );
  });

  it("title 和 content 同时超限返回 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbOverlongTitle(),
        arbOverlongContent(),
        async (title, content) => {
          vi.clearAllMocks();

          setSession("admin1", "ADMIN");
          mockArticleFindUnique.mockResolvedValue({ id: "art1" });

          const { PATCH } = await import("../../[id]/route");
          const res = await PATCH(
            makePatchRequest("art1", { title, content }),
            makeContext("art1"),
          );
          expect(res.status).toBe(400);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("合法 title 和 content 应成功更新", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidTitle(),
        arbValidContent(),
        async (title, content) => {
          vi.clearAllMocks();

          setSession("admin1", "ADMIN");
          mockArticleFindUnique.mockResolvedValue({ id: "art1" });
          mockArticleUpdate.mockResolvedValue({
            id: "art1",
            title,
            content,
          });

          const { PATCH } = await import("../../[id]/route");
          const res = await PATCH(
            makePatchRequest("art1", { title, content }),
            makeContext("art1"),
          );
          expect(res.status).toBe(200);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 16: 知识库 API 仅限 ADMIN ====================
// Feature: dcr-complete-ui, Property 16: 知识库 API 仅限 ADMIN
// **Validates: Requirements 7.3**

describe("Property 16: 知识库 API 仅限 ADMIN — non-ADMIN returns 403", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("非 ADMIN 角色调用 PATCH 返回 403", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonAdminRoles),
        fc.uuid(),
        async (role, articleId) => {
          vi.clearAllMocks();

          setSession(`user-${role}`, role);

          const { PATCH } = await import("../../[id]/route");
          const res = await PATCH(
            makePatchRequest(articleId, { title: "新标题" }),
            makeContext(articleId),
          );
          expect(res.status).toBe(403);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("非 ADMIN 角色调用 DELETE 返回 403", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonAdminRoles),
        fc.uuid(),
        async (role, articleId) => {
          vi.clearAllMocks();

          setSession(`user-${role}`, role);

          const { DELETE } = await import("../../[id]/route");
          const res = await DELETE(
            makeDeleteRequest(articleId),
            makeContext(articleId),
          );
          expect(res.status).toBe(403);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("未认证用户调用 PATCH 返回 401", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (articleId) => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue(null);

        const { PATCH } = await import("../../[id]/route");
        const res = await PATCH(
          makePatchRequest(articleId, { title: "新标题" }),
          makeContext(articleId),
        );
        expect(res.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });

  it("未认证用户调用 DELETE 返回 401", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (articleId) => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue(null);

        const { DELETE } = await import("../../[id]/route");
        const res = await DELETE(
          makeDeleteRequest(articleId),
          makeContext(articleId),
        );
        expect(res.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });

  it("ADMIN 调用 PATCH 不返回 403", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (articleId) => {
        vi.clearAllMocks();

        setSession("admin-user", "ADMIN");
        // Mock article not found to get 404 (proves we passed auth)
        mockArticleFindUnique.mockResolvedValue(null);

        const { PATCH } = await import("../../[id]/route");
        const res = await PATCH(
          makePatchRequest(articleId, { title: "新标题" }),
          makeContext(articleId),
        );
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      }),
      { numRuns: 100 },
    );
  });

  it("ADMIN 调用 DELETE 不返回 403", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (articleId) => {
        vi.clearAllMocks();

        setSession("admin-user", "ADMIN");
        // Mock successful delete
        mockArticleDelete.mockResolvedValue({ id: articleId });

        const { DELETE } = await import("../../[id]/route");
        const res = await DELETE(
          makeDeleteRequest(articleId),
          makeContext(articleId),
        );
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      }),
      { numRuns: 100 },
    );
  });
});
