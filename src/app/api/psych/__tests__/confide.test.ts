import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockConfideRequestFindFirst = vi.fn();
const mockConfideRequestCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    confideRequest: {
      findFirst: (...args: unknown[]) => mockConfideRequestFindFirst(...args),
      create: (...args: unknown[]) => mockConfideRequestCreate(...args),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/utils", () => ({
  generateAnonymousId: () => "匿名用户_ABCD",
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/psych/confide", {
    method: "POST",
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

describe("POST /api/psych/confide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../confide/route");
    const res = await POST(makeRequest({ summary: "test" }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当用户无心理区访问权限", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: false });

    const { POST } = await import("../confide/route");
    const res = await POST(makeRequest({ summary: "我需要倾诉" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("无心理区访问权限");
  });

  it("应返回 409 当用户已有进行中的倾诉请求", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindFirst.mockResolvedValue({
      id: "cr1",
      status: "WAITING",
    });

    const { POST } = await import("../confide/route");
    const res = await POST(makeRequest({ summary: "我需要倾诉" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("您已有进行中的倾诉请求");
  });

  it("应返回 400 当 summary 为空", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindFirst.mockResolvedValue(null);

    const { POST } = await import("../confide/route");
    const res = await POST(makeRequest({ summary: "" }), { params: {} });

    expect(res.status).toBe(400);
  });

  it("应成功创建倾诉请求", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindFirst.mockResolvedValue(null);

    const now = new Date();
    mockConfideRequestCreate.mockResolvedValue({
      id: "cr1",
      summary: "我需要倾诉",
      anonymousId: "匿名用户_ABCD",
      status: "WAITING",
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      createdAt: now,
      requesterId: "user1",
    });

    const { POST } = await import("../confide/route");
    const res = await POST(makeRequest({ summary: "我需要倾诉" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.confideRequest.summary).toBe("我需要倾诉");
    expect(data.confideRequest.anonymousId).toBe("匿名用户_ABCD");
    expect(data.confideRequest.status).toBe("WAITING");
    // Must NOT expose requesterId
    expect(data.confideRequest.requesterId).toBeUndefined();
  });

  it("应使用正确参数调用 prisma 创建请求", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindFirst.mockResolvedValue(null);
    mockConfideRequestCreate.mockResolvedValue({
      id: "cr1",
      summary: "我需要倾诉",
      anonymousId: "匿名用户_ABCD",
      status: "WAITING",
      expiresAt: new Date(),
      createdAt: new Date(),
      requesterId: "user1",
    });

    const { POST } = await import("../confide/route");
    await POST(makeRequest({ summary: "我需要倾诉" }), { params: {} });

    expect(mockConfideRequestCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        summary: "我需要倾诉",
        anonymousId: "匿名用户_ABCD",
        status: "WAITING",
        requesterId: "user1",
      }),
    });
  });
});
