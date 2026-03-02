import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

const mockScanContent = vi.fn();
vi.mock("@/lib/sensitive-engine", () => ({
  scanContent: (...args: unknown[]) => mockScanContent(...args),
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

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
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

const ownProfile = {
  id: "user1",
  nickname: "测试用户",
  avatar: "https://example.com/avatar.png",
  bio: "这是我的简介",
  role: "USER",
  createdAt: new Date("2024-01-01"),
  reputationScore: 100,
  onboardingDone: true,
  psychAccess: false,
  dcrAccess: false,
  quizPassed: true,
  _count: { posts: 5, likes: 10 },
};

const publicProfile = {
  id: "user2",
  nickname: "其他用户",
  avatar: "https://example.com/avatar2.png",
  bio: "其他用户简介",
  createdAt: new Date("2024-02-01"),
  _count: { posts: 3, likes: 7 },
};

// ==================== GET Tests ====================

describe("GET /api/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../../users/[id]/route");
    const res = await GET(
      makeRequest("GET", "http://localhost:3000/api/users/user1"),
      { params: { id: "user1" } } as never,
    );
    expect(res.status).toBe(401);
  });

  it("应返回完整资料当查看自己的资料", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue(ownProfile);

    const { GET } = await import("../../users/[id]/route");
    const res = await GET(
      makeRequest("GET", "http://localhost:3000/api/users/user1"),
      { params: { id: "user1" } } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.role).toBe("USER");
    expect(data.user.reputationScore).toBe(100);
    expect(data.user.onboardingDone).toBe(true);
    expect(data.user._count.posts).toBe(5);
  });

  it("应返回公开资料当查看他人资料", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue(publicProfile);

    const { GET } = await import("../../users/[id]/route");
    const res = await GET(
      makeRequest("GET", "http://localhost:3000/api/users/user2"),
      { params: { id: "user2" } } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.id).toBe("user2");
    expect(data.user.nickname).toBe("其他用户");
    expect(data.user._count.posts).toBe(3);
    // 不应包含私有字段
    expect(data.user.role).toBeUndefined();
    expect(data.user.reputationScore).toBeUndefined();
  });

  it("应返回 404 当用户不存在", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue(null);

    const { GET } = await import("../../users/[id]/route");
    const res = await GET(
      makeRequest("GET", "http://localhost:3000/api/users/nonexistent"),
      { params: { id: "nonexistent" } } as never,
    );
    expect(res.status).toBe(404);
  });
});

// ==================== PATCH Tests ====================

describe("PATCH /api/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../../users/[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/users/user1", { nickname: "新昵称" }),
      { params: { id: "user1" } } as never,
    );
    expect(res.status).toBe(401);
  });

  it("应返回 403 当尝试修改他人资料", async () => {
    setSession("user1", "USER");
    const { PATCH } = await import("../../users/[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/users/user2", { nickname: "新昵称" }),
      { params: { id: "user2" } } as never,
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("只能修改自己的资料");
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("user1", "USER");
    const { PATCH } = await import("../../users/[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/users/user1", { nickname: "a" }),
      { params: { id: "user1" } } as never,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("参数校验失败");
  });

  it("应返回 400 当昵称包含敏感词", async () => {
    setSession("user1", "USER");
    mockScanContent.mockResolvedValue([
      { word: "敏感词", category: "PROFANITY", startIndex: 0, endIndex: 3 },
    ]);

    const { PATCH } = await import("../../users/[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/users/user1", { nickname: "敏感词昵称" }),
      { params: { id: "user1" } } as never,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("昵称包含敏感词");
    expect(data.matches).toHaveLength(1);
  });

  it("应成功更新昵称", async () => {
    setSession("user1", "USER");
    mockScanContent.mockResolvedValue([]);
    mockUserFindUnique.mockResolvedValue({ id: "user1" });
    mockUserUpdate.mockResolvedValue({
      id: "user1",
      nickname: "新昵称ok",
      avatar: null,
      bio: null,
      role: "USER",
      createdAt: new Date("2024-01-01"),
    });

    const { PATCH } = await import("../../users/[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/users/user1", { nickname: "新昵称ok" }),
      { params: { id: "user1" } } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.nickname).toBe("新昵称ok");
    expect(mockScanContent).toHaveBeenCalledWith("新昵称ok");
  });

  it("应成功更新头像和简介（不触发敏感词检测）", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1" });
    mockUserUpdate.mockResolvedValue({
      id: "user1",
      nickname: "测试用户",
      avatar: "https://example.com/new-avatar.png",
      bio: "新的简介",
      role: "USER",
      createdAt: new Date("2024-01-01"),
    });

    const { PATCH } = await import("../../users/[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/users/user1", {
        avatar: "https://example.com/new-avatar.png",
        bio: "新的简介",
      }),
      { params: { id: "user1" } } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.avatar).toBe("https://example.com/new-avatar.png");
    expect(data.user.bio).toBe("新的简介");
    // 没有更新昵称，不应调用敏感词检测
    expect(mockScanContent).not.toHaveBeenCalled();
  });

  it("应返回 404 当用户不存在", async () => {
    setSession("ghost", "USER");
    mockScanContent.mockResolvedValue([]);
    mockUserFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../../users/[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/users/ghost", { nickname: "新昵称ok" }),
      { params: { id: "ghost" } } as never,
    );
    expect(res.status).toBe(404);
  });
});
