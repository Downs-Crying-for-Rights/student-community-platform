import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockConfideRequestFindUnique = vi.fn();
const mockConfideRequestUpdate = vi.fn();
const mockCreateNotification = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    confideRequest: {
      findUnique: (...args: unknown[]) => mockConfideRequestFindUnique(...args),
      update: (...args: unknown[]) => mockConfideRequestUpdate(...args),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/notification", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/psych/match/cr1", {
    method: "POST",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const waitingRequest = {
  id: "cr1",
  summary: "我需要倾诉",
  anonymousId: "匿名用户_ABCD",
  status: "WAITING",
  requesterId: "user1",
  listenerId: null,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
};

// ==================== Tests ====================

describe("POST /api/psych/match/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../match/[id]/route");
    const res = await POST(makeRequest(), { params: { id: "cr1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当用户无心理区访问权限", async () => {
    setSession("listener1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: false });

    const { POST } = await import("../match/[id]/route");
    const res = await POST(makeRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("无心理区访问权限");
  });

  it("应返回 404 当倾诉请求不存在", async () => {
    setSession("listener1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindUnique.mockResolvedValue(null);

    const { POST } = await import("../match/[id]/route");
    const res = await POST(makeRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("倾诉请求不存在");
  });

  it("应返回 409 当请求已被领取", async () => {
    setSession("listener1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindUnique.mockResolvedValue({
      ...waitingRequest,
      status: "MATCHED",
    });

    const { POST } = await import("../match/[id]/route");
    const res = await POST(makeRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("该请求已被领取");
  });

  it("应返回 400 当尝试领取自己的请求", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindUnique.mockResolvedValue(waitingRequest);

    const { POST } = await import("../match/[id]/route");
    const res = await POST(makeRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("不能领取自己的倾诉请求");
  });

  it("应成功领取倾诉请求", async () => {
    setSession("listener1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindUnique.mockResolvedValue(waitingRequest);
    mockConfideRequestUpdate.mockResolvedValue({
      ...waitingRequest,
      status: "MATCHED",
      listenerId: "listener1",
    });
    mockCreateNotification.mockResolvedValue({});

    const { POST } = await import("../match/[id]/route");
    const res = await POST(makeRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.confideRequest.status).toBe("MATCHED");
    // Must NOT expose requesterId
    expect(data.confideRequest.requesterId).toBeUndefined();
  });

  it("应创建通知给倾诉者", async () => {
    setSession("listener1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
    mockConfideRequestFindUnique.mockResolvedValue(waitingRequest);
    mockConfideRequestUpdate.mockResolvedValue({
      ...waitingRequest,
      status: "MATCHED",
      listenerId: "listener1",
    });
    mockCreateNotification.mockResolvedValue({});

    const { POST } = await import("../match/[id]/route");
    await POST(makeRequest(), { params: { id: "cr1" } });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      "user1",
      "PSYCH_MATCH",
      "倾诉请求已被领取",
      expect.any(String),
    );
  });
});
