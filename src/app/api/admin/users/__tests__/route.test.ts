import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindMany = vi.fn();
const mockUserCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      count: (...args: unknown[]) => mockUserCount(...args),
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

function makeRequest(url?: string): NextRequest {
  return new NextRequest(url ?? "http://localhost:3000/api/admin/users", { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const sampleUsers = [
  {
    id: "u1",
    email: "user1@test.com",
    nickname: "用户1",
    avatar: null,
    role: "USER",
    isBanned: false,
    isShadowBanned: false,
    reputationScore: 100,
    violationCount: 0,
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "u2",
    email: "user2@test.com",
    nickname: "用户2",
    avatar: null,
    role: "MODERATOR",
    isBanned: false,
    isShadowBanned: false,
    reputationScore: 150,
    violationCount: 0,
    createdAt: new Date("2024-02-01"),
  },
];

// ==================== Tests ====================

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户访问", async () => {
    setSession("user1", "USER");
    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回 403 当 Moderator 用户访问", async () => {
    setSession("mod1", "MODERATOR");
    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回用户列表（Admin）", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindMany.mockResolvedValue(sampleUsers);
    mockUserCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.users).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
    expect(data.totalPages).toBe(1);
  });

  it("应支持按角色筛选", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindMany.mockResolvedValue([sampleUsers[0]]);
    mockUserCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest("http://localhost:3000/api/admin/users?role=USER"),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: "USER" }),
      }),
    );
    expect(data.users).toHaveLength(1);
  });

  it("应支持按封禁状态筛选", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindMany.mockResolvedValue([]);
    mockUserCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest("http://localhost:3000/api/admin/users?isBanned=true"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isBanned: true }),
      }),
    );
  });

  it("应支持按注册时间范围筛选", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindMany.mockResolvedValue([]);
    mockUserCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest(
        "http://localhost:3000/api/admin/users?startDate=2024-01-01T00:00:00Z&endDate=2024-06-01T00:00:00Z",
      ),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it("应支持分页", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindMany.mockResolvedValue([sampleUsers[1]]);
    mockUserCount.mockResolvedValue(25);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest("http://localhost:3000/api/admin/users?page=2&pageSize=10"),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(10);
    expect(data.totalPages).toBe(3);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
  });

  it("应支持搜索用户", async () => {
    setSession("admin1", "ADMIN");
    mockUserFindMany.mockResolvedValue([sampleUsers[0]]);
    mockUserCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest("http://localhost:3000/api/admin/users?search=用户1"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ nickname: expect.objectContaining({ contains: "用户1" }) }),
            expect.objectContaining({ email: expect.objectContaining({ contains: "用户1" }) }),
          ]),
        }),
      }),
    );
  });
});
