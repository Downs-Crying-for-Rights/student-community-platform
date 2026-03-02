import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockRunAllCleanup = vi.fn();

vi.mock("@/lib/cleanup", () => ({
  runAllCleanup: (...args: unknown[]) => mockRunAllCleanup(...args),
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

function makePostRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/cleanup", {
    method: "POST",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const sampleReport = {
  expiredConfideRequests: 2,
  oldAnonymousSessionMessages: 10,
  archivedCases: 3,
  archivableAuditLogs: 42,
  expiredListeningSessions: 5,
  executedAt: "2024-06-15T00:00:00.000Z",
};

// ==================== Tests ====================

describe("POST /api/admin/cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makePostRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户访问", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(makePostRequest(), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回 403 当 Moderator 用户访问", async () => {
    setSession("mod1", "MODERATOR");
    const { POST } = await import("../route");
    const res = await POST(makePostRequest(), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应成功执行清理并返回报告（Admin）", async () => {
    setSession("admin1", "ADMIN");
    mockRunAllCleanup.mockResolvedValue(sampleReport);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe("数据清理完成");
    expect(data.report).toEqual(sampleReport);
    expect(mockRunAllCleanup).toHaveBeenCalledOnce();
  });

  it("应返回 500 当清理执行失败", async () => {
    setSession("admin1", "ADMIN");
    mockRunAllCleanup.mockRejectedValue(new Error("Database error"));

    const { POST } = await import("../route");
    const res = await POST(makePostRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("数据清理执行失败");
  });
});
