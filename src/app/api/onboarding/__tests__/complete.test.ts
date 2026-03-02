import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../complete/route";

/**
 * 新手引导完成 API 测试
 *
 * 验证 POST /api/onboarding/complete 端点：
 * - 未登录返回 401
 * - 登录用户成功设置 quizPassed 和 onboardingDone
 * - 数据库错误返回 500
 *
 * Validates: Requirements 15.3, 7.3
 */

// Mock getServerSession
const mockGetServerSession = vi.fn();
vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

// Mock auth options
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

// Mock Prisma
const mockUserUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

describe("POST /api/onboarding/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未登录时返回 401", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe("未登录");
  });

  it("session 中无 user.id 时返回 401", async () => {
    mockGetServerSession.mockResolvedValue({ user: {} });

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe("未登录");
  });

  it("登录用户成功完成新手引导", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", role: "USER" },
    });

    const updatedUser = {
      id: "user-123",
      quizPassed: true,
      onboardingDone: true,
    };
    mockUserUpdate.mockResolvedValue(updatedUser);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user).toEqual(updatedUser);

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-123" },
      data: {
        quizPassed: true,
        onboardingDone: true,
      },
      select: {
        id: true,
        quizPassed: true,
        onboardingDone: true,
      },
    });
  });

  it("数据库错误时返回 500", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", role: "USER" },
    });
    mockUserUpdate.mockRejectedValue(new Error("DB error"));

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("服务器内部错误，请稍后重试");
  });
});
