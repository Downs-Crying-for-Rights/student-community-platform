import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    tag: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

const mockLogAudit = vi.fn().mockResolvedValue({});
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: { BOARD_PERMISSION_CHANGE: "BOARD_PERMISSION_CHANGE" },
  AuditTargetType: { BOARD: "BOARD" },
}));

import { getServerSession } from "next-auth/next";

const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeRequest(method: string, body?: unknown, urlOverride?: string): NextRequest {
  const url = urlOverride ?? "http://localhost:3000/api/tags";
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

// ==================== Tests ====================

describe("GET /api/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回按名称排序的标签列表", async () => {
    setSession("user1", "USER");

    const tags = [
      { id: "t1", name: "AI", createdAt: new Date() },
      { id: "t2", name: "编程", createdAt: new Date() },
      { id: "t3", name: "隐私", createdAt: new Date() },
    ];
    mockFindMany.mockResolvedValue(tags);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tags).toHaveLength(3);
    expect(data.tags[0].name).toBe("AI");
    expect(data.tags[1].name).toBe("编程");
    expect(data.tags[2].name).toBe("隐私");
    expect(mockFindMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
    });
  });

  it("应返回空数组当没有标签", async () => {
    setSession("user1", "USER");
    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tags).toEqual([]);
  });

  it("应返回按帖子数量排序的热门标签当 hot=true", async () => {
    setSession("user1", "USER");

    const hotTags = [
      { id: "t1", name: "热门", createdAt: new Date(), _count: { posts: 50 } },
      { id: "t2", name: "次热", createdAt: new Date(), _count: { posts: 30 } },
    ];
    mockFindMany.mockResolvedValue(hotTags);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest("GET", undefined, "http://localhost:3000/api/tags?hot=true"),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tags).toHaveLength(2);
    expect(data.tags[0]._count.posts).toBe(50);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          _count: {
            select: {
              posts: {
                where: { post: { status: "PUBLISHED" } },
              },
            },
          },
        },
        orderBy: { posts: { _count: "desc" } },
        take: 20,
      }),
    );
  });

  it("应在 hot 参数不为 true 时返回普通排序", async () => {
    setSession("user1", "USER");
    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest("GET", undefined, "http://localhost:3000/api/tags?hot=false"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
  });
});

describe("POST /api/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", { name: "Test" }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当普通用户尝试创建标签", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", { name: "Test" }), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回 403 当 TrustedUser 尝试创建标签", async () => {
    setSession("user2", "TRUSTED_USER");
    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", { name: "Test" }), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应允许 Moderator 创建标签", async () => {
    setSession("mod1", "MODERATOR");

    mockFindUnique.mockResolvedValue(null); // no duplicate
    const newTag = { id: "t-new", name: "新标签", createdAt: new Date() };
    mockCreate.mockResolvedValue(newTag);

    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", { name: "新标签" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.tag).toEqual(expect.objectContaining({ name: "新标签" }));
    expect(mockCreate).toHaveBeenCalledWith({ data: { name: "新标签" } });
    expect(mockLogAudit).toHaveBeenCalled();
  });

  it("应允许 Admin 创建标签", async () => {
    setSession("admin1", "ADMIN");

    mockFindUnique.mockResolvedValue(null);
    const newTag = { id: "t-new2", name: "管理标签", createdAt: new Date() };
    mockCreate.mockResolvedValue(newTag);

    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", { name: "管理标签" }), { params: {} });

    expect(res.status).toBe(201);
  });

  it("应返回 409 当标签名称已存在", async () => {
    setSession("mod1", "MODERATOR");

    mockFindUnique.mockResolvedValue({ id: "t-existing", name: "已存在", createdAt: new Date() });

    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", { name: "已存在" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("标签名称已存在");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("应返回 400 当标签名称为空", async () => {
    setSession("mod1", "MODERATOR");

    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", { name: "" }), { params: {} });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("参数校验失败");
  });

  it("应返回 400 当标签名称超过 30 个字符", async () => {
    setSession("mod1", "MODERATOR");

    const longName = "a".repeat(31);
    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", { name: longName }), { params: {} });

    expect(res.status).toBe(400);
  });

  it("应返回 400 当缺少 name 字段", async () => {
    setSession("mod1", "MODERATOR");

    const { POST } = await import("../route");
    const res = await POST(makeRequest("POST", {}), { params: {} });

    expect(res.status).toBe(400);
  });
});
