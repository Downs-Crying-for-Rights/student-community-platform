import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    board: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockUpdate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
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

function makeRequest(method: string, body?: unknown, urlOverride?: string): NextRequest {
  const url = urlOverride ?? "http://localhost:3000/api/boards";
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

describe("GET /api/boards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回用户可访问的活跃板块列表", async () => {
    setSession("user1", "USER");

    mockFindUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days old
      violationCount: 0,
      onboardingDone: true,
      quizPassed: true,
      psychAccess: false,
      dcrAccess: false,
      dcrPledgeSigned: false,
      reputationScore: 100,
      role: "USER",
    });

    const boards = [
      { id: "b1", name: "娱乐", zone: "PUBLIC", sortWeight: 0, isActive: true },
      { id: "b2", name: "编程", zone: "PUBLIC", sortWeight: 1, isActive: true },
    ];
    mockFindMany.mockResolvedValue(boards);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.boards).toEqual(boards);

    // Should only query PUBLIC zone for a user without psych/dcr access
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          zone: { in: ["PUBLIC"] },
        },
        orderBy: { sortWeight: "asc" },
      }),
    );
  });

  it("应为有心理区权限的用户返回 PUBLIC 和 PSYCHOLOGY 板块", async () => {
    setSession("user2", "TRUSTED_USER");

    mockFindUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      violationCount: 0,
      onboardingDone: true,
      quizPassed: true,
      psychAccess: true,
      dcrAccess: false,
      dcrPledgeSigned: false,
      reputationScore: 100,
      role: "TRUSTED_USER",
    });

    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          zone: { in: ["PUBLIC", "PSYCHOLOGY"] },
        },
      }),
    );
  });

  it("应为有 DCR 权限的用户返回 PUBLIC 和 DCR 板块", async () => {
    setSession("user3", "TRUSTED_USER");

    mockFindUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      violationCount: 0,
      onboardingDone: true,
      quizPassed: true,
      psychAccess: false,
      dcrAccess: true,
      dcrPledgeSigned: true,
      reputationScore: 100,
      role: "TRUSTED_USER",
    });

    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          zone: { in: ["PUBLIC", "DCR"] },
        },
      }),
    );
  });

  it("应返回 404 当用户不存在", async () => {
    setSession("ghost", "USER");
    mockFindUnique.mockResolvedValue(null);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    expect(res.status).toBe(404);
  });

  it("应返回按帖子数量排序的热门板块当 hot=true", async () => {
    setSession("user1", "USER");

    mockFindUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      violationCount: 0,
      onboardingDone: true,
      quizPassed: true,
      psychAccess: false,
      dcrAccess: false,
      dcrPledgeSigned: false,
      reputationScore: 100,
      role: "USER",
    });

    const hotBoards = [
      { id: "b1", name: "娱乐", zone: "PUBLIC", isActive: true, _count: { posts: 100 } },
      { id: "b2", name: "编程", zone: "PUBLIC", isActive: true, _count: { posts: 50 } },
    ];
    mockFindMany.mockResolvedValue(hotBoards);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest("GET", undefined, "http://localhost:3000/api/boards?hot=true"),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.boards).toHaveLength(2);
    expect(data.boards[0]._count.posts).toBe(100);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          zone: { in: ["PUBLIC"] },
        },
        include: {
          _count: {
            select: {
              posts: {
                where: { status: "PUBLISHED" },
              },
            },
          },
        },
        orderBy: { posts: { _count: "desc" } },
      }),
    );
  });

  it("应在 hot=true 时仍然尊重区域访问控制", async () => {
    setSession("user2", "TRUSTED_USER");

    mockFindUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      violationCount: 0,
      onboardingDone: true,
      quizPassed: true,
      psychAccess: true,
      dcrAccess: false,
      dcrPledgeSigned: false,
      reputationScore: 100,
      role: "TRUSTED_USER",
    });

    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    await GET(
      makeRequest("GET", undefined, "http://localhost:3000/api/boards?hot=true"),
      { params: {} },
    );

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          zone: { in: ["PUBLIC", "PSYCHOLOGY"] },
        },
      }),
    );
  });
});

describe("POST /api/boards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", { name: "Test", zone: "PUBLIC" }),
      { params: {} },
    );
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户尝试创建板块", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", { name: "Test", zone: "PUBLIC" }),
      { params: {} },
    );
    expect(res.status).toBe(403);
  });

  it("应返回 403 当 Moderator 尝试创建板块", async () => {
    setSession("mod1", "MODERATOR");
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", { name: "Test", zone: "PUBLIC" }),
      { params: {} },
    );
    expect(res.status).toBe(403);
  });

  it("应允许 Admin 创建板块", async () => {
    setSession("admin1", "ADMIN");

    const newBoard = {
      id: "b-new",
      name: "新板块",
      description: "描述",
      zone: "PUBLIC",
      sortWeight: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCreate.mockResolvedValue(newBoard);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", {
        name: "新板块",
        description: "描述",
        zone: "PUBLIC",
        sortWeight: 5,
      }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.board).toEqual(expect.objectContaining({ name: "新板块" }));
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: "新板块",
        description: "描述",
        zone: "PUBLIC",
        sortWeight: 5,
      },
    });
  });

  it("应返回 400 当缺少必填字段", async () => {
    setSession("admin1", "ADMIN");

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", { description: "只有描述" }),
      { params: {} },
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("参数校验失败");
  });

  it("应返回 400 当 zone 值无效", async () => {
    setSession("admin1", "ADMIN");

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", { name: "Test", zone: "INVALID" }),
      { params: {} },
    );

    expect(res.status).toBe(400);
  });
});
