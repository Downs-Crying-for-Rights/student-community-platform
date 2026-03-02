import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockPostFindMany = vi.fn();
const mockPostCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    post: {
      findMany: (...args: unknown[]) => mockPostFindMany(...args),
      count: (...args: unknown[]) => mockPostCount(...args),
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
  const fullUrl = url ?? "http://localhost:3000/api/moderation/queue";
  return new NextRequest(fullUrl, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== GET /api/moderation/queue Tests ====================

describe("GET /api/moderation/queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../../moderation/queue/route");
    const res = await GET(makeRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当普通用户访问", async () => {
    setSession("user1", "USER");
    const { GET } = await import("../../moderation/queue/route");
    const res = await GET(makeRequest(), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回审核队列列表（Moderator）", async () => {
    setSession("mod1", "MODERATOR");
    const posts = [
      {
        id: "p1",
        title: "待审核帖子",
        status: "PENDING",
        author: { id: "u1", nickname: "用户1", avatar: null },
        board: { id: "b1", name: "DCR区", zone: "DCR" },
        tags: [],
      },
    ];
    mockPostFindMany.mockResolvedValue(posts);
    mockPostCount.mockResolvedValue(1);

    const { GET } = await import("../../moderation/queue/route");
    const res = await GET(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.posts).toEqual(posts);
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
  });

  it("应返回审核队列列表（Admin）", async () => {
    setSession("admin1", "ADMIN");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("../../moderation/queue/route");
    const res = await GET(makeRequest(), { params: {} });
    expect(res.status).toBe(200);
  });

  it("应支持分页参数", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(25);

    const { GET } = await import("../../moderation/queue/route");
    const url = "http://localhost:3000/api/moderation/queue?page=2&pageSize=10";
    const res = await GET(makeRequest(url), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(10);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: { status: "PENDING" },
      }),
    );
  });

  it("应只查询 PENDING 状态的帖子", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("../../moderation/queue/route");
    await GET(makeRequest(), { params: {} });

    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING" },
      }),
    );
    expect(mockPostCount).toHaveBeenCalledWith({
      where: { status: "PENDING" },
    });
  });
});
