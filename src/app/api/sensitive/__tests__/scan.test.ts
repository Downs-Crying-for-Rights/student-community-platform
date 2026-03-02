import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockScanContent = vi.fn();

vi.mock("@/lib/sensitive-engine", () => ({
  scanContent: (...args: unknown[]) => mockScanContent(...args),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  default: {},
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makePostRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/sensitive/scan", {
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

describe("POST /api/sensitive/scan", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../scan/route");
    const res = await POST(makePostRequest({ text: "测试内容" }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 400 当 text 为空", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../scan/route");
    const res = await POST(makePostRequest({ text: "" }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("应返回 400 当缺少 text 字段", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../scan/route");
    const res = await POST(makePostRequest({}), { params: {} });
    expect(res.status).toBe(400);
  });

  it("应返回空匹配列表当无敏感词", async () => {
    setSession("user1", "USER");
    mockScanContent.mockResolvedValue([]);

    const { POST } = await import("../scan/route");
    const res = await POST(makePostRequest({ text: "这是一段正常内容" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.matches).toEqual([]);
  });

  it("应返回匹配结果当检测到敏感词", async () => {
    setSession("user1", "USER");
    const matches = [
      { word: "张三", category: "PII", startIndex: 0, endIndex: 2 },
    ];
    mockScanContent.mockResolvedValue(matches);

    const { POST } = await import("../scan/route");
    const res = await POST(makePostRequest({ text: "张三是我的老师" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].word).toBe("张三");
    expect(data.matches[0].category).toBe("PII");
  });
});
