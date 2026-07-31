import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockConfideRequestFindUnique = vi.fn();
const mockConfideRequestUpdate = vi.fn();
const mockConfideRequestUpdateMany = vi.fn();
const mockCreateNotification = vi.fn();
const mockMessageCreate = vi.fn();
const mockScanContent = vi.fn();
const mockUserFindMany = vi.fn();
const mockUserFindUnique = vi.fn();
const mockAuditLogCreate = vi.fn();
const mockMessageFindMany = vi.fn();
const mockMessageCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    confideRequest: {
      findUnique: (...args: unknown[]) => mockConfideRequestFindUnique(...args),
      update: (...args: unknown[]) => mockConfideRequestUpdate(...args),
      updateMany: (...args: unknown[]) => mockConfideRequestUpdateMany(...args),
    },
    message: {
      create: (...args: unknown[]) => mockMessageCreate(...args),
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
      count: (...args: unknown[]) => mockMessageCount(...args),
    },
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      $executeRaw: vi.fn(),
      confideRequest: {
        findUnique: (...args: unknown[]) => mockConfideRequestFindUnique(...args),
        update: (...args: unknown[]) => mockConfideRequestUpdate(...args),
        updateMany: (...args: unknown[]) => mockConfideRequestUpdateMany(...args),
      },
      message: { create: (...args: unknown[]) => mockMessageCreate(...args) },
      user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
      auditLog: { create: (...args: unknown[]) => mockAuditLogCreate(...args) },
    }),
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

vi.mock("@/lib/sensitive-engine", () => ({
  scanContent: (...args: unknown[]) => mockScanContent(...args),
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeCloseRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/psych/session/cr1/close", {
    method: "POST",
  });
}

function makeMessageRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/psych/session/cr1/message", {
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

const matchedSession = {
  id: "cr1",
  summary: "我需要倾诉",
  anonymousId: "匿名用户_ABCD",
  status: "MATCHED",
  requesterId: "user1",
  listenerId: "listener1",
  createdAt: new Date(),
  closedAt: null,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
};

// ==================== Close Session Tests ====================

describe("POST /api/psych/session/[id]/close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../session/[id]/close/route");
    const res = await POST(makeCloseRequest(), { params: { id: "cr1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 404 当会话不存在", async () => {
    setSession("user1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue(null);

    const { POST } = await import("../session/[id]/close/route");
    const res = await POST(makeCloseRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("会话不存在");
  });

  it("应返回 403 当用户不是会话参与方", async () => {
    setSession("stranger", "USER");
    mockConfideRequestFindUnique.mockResolvedValue(matchedSession);

    const { POST } = await import("../session/[id]/close/route");
    const res = await POST(makeCloseRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("无权关闭此会话");
  });

  it("重复关闭会话应幂等成功", async () => {
    setSession("user1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue({
      ...matchedSession,
      status: "CLOSED",
    });

    const { POST } = await import("../session/[id]/close/route");
    const res = await POST(makeCloseRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.confideRequest.status).toBe("CLOSED");
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("应成功关闭会话（倾诉者关闭）", async () => {
    setSession("user1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue(matchedSession);
    mockConfideRequestUpdate.mockResolvedValue({
      ...matchedSession,
      status: "CLOSED",
      closedAt: new Date(),
    });
    mockCreateNotification.mockResolvedValue({});

    const { POST } = await import("../session/[id]/close/route");
    const res = await POST(makeCloseRequest(), { params: { id: "cr1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.confideRequest.status).toBe("CLOSED");
    // Should notify the listener
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "listener1",
      "PSYCH_MATCH",
      "倾听会话已结束",
      expect.any(String),
    );
  });

  it("应成功关闭会话（倾听者关闭）", async () => {
    setSession("listener1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue(matchedSession);
    mockConfideRequestUpdate.mockResolvedValue({
      ...matchedSession,
      status: "CLOSED",
      closedAt: new Date(),
    });
    mockCreateNotification.mockResolvedValue({});

    const { POST } = await import("../session/[id]/close/route");
    const res = await POST(makeCloseRequest(), { params: { id: "cr1" } });

    expect(res.status).toBe(200);
    // Should notify the requester
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "user1",
      "PSYCH_MATCH",
      "倾听会话已结束",
      expect.any(String),
    );
  });
});

// ==================== Send Message Tests ====================

describe("POST /api/psych/session/[id]/message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../session/[id]/message/route");
    const res = await POST(
      makeMessageRequest({ content: "hello" }),
      { params: { id: "cr1" } },
    );
    expect(res.status).toBe(401);
  });

  it("应返回 403 当用户不是会话参与方", async () => {
    setSession("stranger", "USER");
    mockConfideRequestFindUnique.mockResolvedValue(matchedSession);

    const { POST } = await import("../session/[id]/message/route");
    const res = await POST(
      makeMessageRequest({ content: "hello" }),
      { params: { id: "cr1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("无权发送消息");
  });

  it("应返回 400 当会话未处于活跃状态", async () => {
    setSession("user1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue({
      ...matchedSession,
      status: "CLOSED",
    });

    const { POST } = await import("../session/[id]/message/route");
    const res = await POST(
      makeMessageRequest({ content: "hello" }),
      { params: { id: "cr1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("会话未处于活跃状态");
  });

  it("应成功发送消息（无风险词）", async () => {
    setSession("user1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue(matchedSession);
    mockScanContent.mockResolvedValue([]);
    mockMessageCreate.mockResolvedValue({
      id: "msg1",
      content: "你好",
      isAnonymous: true,
      createdAt: new Date(),
      sessionId: "cr1",
    });
    mockConfideRequestUpdate.mockResolvedValue({
      ...matchedSession,
      status: "ACTIVE",
    });

    const { POST } = await import("../session/[id]/message/route");
    const res = await POST(
      makeMessageRequest({ content: "你好" }),
      { params: { id: "cr1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message.content).toBe("你好");
    expect(data.message.isAnonymous).toBe(true);
    expect(data.riskDetected).toBe(false);
  });

  it("应检测风险触发词并通知 Moderator", async () => {
    setSession("user1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue({
      ...matchedSession,
      status: "ACTIVE",
    });
    mockScanContent.mockResolvedValue([
      { word: "自杀", category: "RISK", startIndex: 0, endIndex: 2 },
    ]);
    mockUserFindMany.mockResolvedValue([{ id: "mod1" }]);
    mockCreateNotification.mockResolvedValue({});
    mockMessageCreate.mockResolvedValue({
      id: "msg1",
      content: "自杀",
      isAnonymous: true,
      createdAt: new Date(),
      sessionId: "cr1",
    });

    const { POST } = await import("../session/[id]/message/route");
    const res = await POST(
      makeMessageRequest({ content: "自杀" }),
      { params: { id: "cr1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.riskDetected).toBe(true);
    // Should notify moderator
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "mod1",
      "SYSTEM",
      "倾听会话风险预警",
      expect.stringContaining("cr1"),
    );
  });

  it("应在 MATCHED 状态下发送消息后升级为 ACTIVE", async () => {
    setSession("user1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue(matchedSession);
    mockScanContent.mockResolvedValue([]);
    mockMessageCreate.mockResolvedValue({
      id: "msg1",
      content: "你好",
      isAnonymous: true,
      createdAt: new Date(),
      sessionId: "cr1",
    });
    mockConfideRequestUpdate.mockResolvedValue({
      ...matchedSession,
      status: "ACTIVE",
    });

    const { POST } = await import("../session/[id]/message/route");
    await POST(
      makeMessageRequest({ content: "你好" }),
      { params: { id: "cr1" } },
    );

    expect(mockConfideRequestUpdateMany).toHaveBeenCalledWith({
      where: { id: "cr1", status: "MATCHED" },
      data: { status: "ACTIVE" },
    });
  });

  it("过期会话不会写入消息或重新变为 ACTIVE", async () => {
    setSession("user1", "USER");
    mockConfideRequestFindUnique.mockResolvedValue({
      ...matchedSession,
      expiresAt: new Date(Date.now() - 1_000),
    });
    mockScanContent.mockResolvedValue([]);

    const { POST } = await import("../session/[id]/message/route");
    const res = await POST(makeMessageRequest({ content: "迟到的消息" }), { params: { id: "cr1" } });

    expect(res.status).toBe(410);
    expect(mockMessageCreate).not.toHaveBeenCalled();
    expect(mockConfideRequestUpdateMany).not.toHaveBeenCalled();
  });
});
