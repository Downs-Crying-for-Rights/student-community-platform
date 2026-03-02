import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockConfideRequestFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    confideRequest: {
      findMany: (...args: unknown[]) => mockConfideRequestFindMany(...args),
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

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/psych/queue", {
    method: "GET",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("GET /api/psych/queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../queue/route");
    const res = await GET(makeRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当用户无心理区访问权限", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: false });

    const { GET } = await import("../queue/route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("无心理区访问权限");
  });

  it("应返回空队列", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindMany.mockResolvedValue([]);

    const { GET } = await import("../queue/route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.queue).toEqual([]);
  });

  it("应返回队列且不包含 requesterId（匿名性验证）", async () => {
    setSession("listener1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });

    const now = new Date();
    mockConfideRequestFindMany.mockResolvedValue([
      {
        id: "cr1",
        summary: "我需要倾诉",
        anonymousId: "匿名用户_ABCD",
        createdAt: now,
      },
      {
        id: "cr2",
        summary: "心情不好",
        anonymousId: "匿名用户_EFGH",
        createdAt: new Date(now.getTime() + 1000),
      },
    ]);

    const { GET } = await import("../queue/route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.queue).toHaveLength(2);

    // Verify no identity leak — requesterId must NOT be present
    for (const item of data.queue) {
      expect(item.requesterId).toBeUndefined();
      expect(item.listenerId).toBeUndefined();
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("summary");
      expect(item).toHaveProperty("anonymousId");
      expect(item).toHaveProperty("createdAt");
    }
  });

  it("应使用正确的查询参数调用 prisma", async () => {
    setSession("listener1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindMany.mockResolvedValue([]);

    const { GET } = await import("../queue/route");
    await GET(makeRequest(), { params: {} });

    expect(mockConfideRequestFindMany).toHaveBeenCalledWith({
      where: { status: "WAITING" },
      select: {
        id: true,
        summary: true,
        anonymousId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  });
});
