import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockAccessApplicationFindFirst = vi.fn();
const mockAccessApplicationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    accessApplication: {
      findFirst: (...args: unknown[]) => mockAccessApplicationFindFirst(...args),
      create: (...args: unknown[]) => mockAccessApplicationCreate(...args),
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
  return new NextRequest("http://localhost:3000/api/psych/apply", {
    method: "POST",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== POST /api/psych/apply Tests ====================

describe("POST /api/psych/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 409 当用户已拥有心理区访问权限", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: true });

    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("您已拥有心理区访问权限");
  });

  it("应返回 409 当用户已有待审核申请", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: false });
    mockAccessApplicationFindFirst.mockResolvedValue({
      id: "app1",
      type: "PSYCHOLOGY",
      status: "PENDING",
    });

    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("您已有待审核的心理区准入申请");
  });

  it("应成功创建准入申请", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: false });
    mockAccessApplicationFindFirst.mockResolvedValue(null);
    mockAccessApplicationCreate.mockResolvedValue({
      id: "app1",
      type: "PSYCHOLOGY",
      status: "PENDING",
      applicantId: "user1",
      createdAt: new Date(),
    });

    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.application.type).toBe("PSYCHOLOGY");
    expect(data.application.status).toBe("PENDING");
    expect(data.application.applicantId).toBe("user1");
  });

  it("应使用正确参数调用 prisma 创建申请", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ psychAccess: false });
    mockAccessApplicationFindFirst.mockResolvedValue(null);
    mockAccessApplicationCreate.mockResolvedValue({
      id: "app1",
      type: "PSYCHOLOGY",
      status: "PENDING",
      applicantId: "user1",
    });

    const { POST } = await import("../apply/route");
    await POST(makeRequest(), { params: {} });

    expect(mockAccessApplicationCreate).toHaveBeenCalledWith({
      data: {
        type: "PSYCHOLOGY",
        status: "PENDING",
        applicantId: "user1",
      },
    });
  });
});
