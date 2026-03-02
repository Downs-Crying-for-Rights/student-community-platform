import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before importing the route
const mockGetToken = vi.fn();
const mockVerifyCode = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();

vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

vi.mock("@/lib/sms/verification", () => ({
  verifyCode: (...args: unknown[]) => mockVerifyCode(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

import { POST } from "../route";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/bindphone", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/bindphone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== 未登录拒绝 ==========

  describe("未登录拒绝", () => {
    it("应在未登录时返回 401", async () => {
      mockGetToken.mockResolvedValue(null);

      const req = createRequest({ phone: "13800138000", code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("未登录，请先登录");
      expect(mockVerifyCode).not.toHaveBeenCalled();
    });

    it("应在 token 无 id 时返回 401", async () => {
      mockGetToken.mockResolvedValue({ role: "USER" });

      const req = createRequest({ phone: "13800138000", code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("未登录，请先登录");
    });
  });

  // ========== 输入验证失败 ==========

  describe("输入验证失败", () => {
    beforeEach(() => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
    });

    it("应拒绝无效手机号格式", async () => {
      const req = createRequest({ phone: "1234", code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockVerifyCode).not.toHaveBeenCalled();
    });

    it("应拒绝无效验证码格式", async () => {
      const req = createRequest({ phone: "13800138000", code: "abc" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });

    it("应拒绝缺少 phone 字段", async () => {
      const req = createRequest({ code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });

    it("应拒绝缺少 code 字段", async () => {
      const req = createRequest({ phone: "13800138000" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });
  });

  // ========== 验证码错误 ==========

  describe("验证码错误", () => {
    it("应在验证码错误时返回 400", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockVerifyCode.mockResolvedValue(false);

      const req = createRequest({ phone: "13800138000", code: "123456" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("验证码错误或已过期");
      expect(mockVerifyCode).toHaveBeenCalledWith("13800138000", "123456", "bindphone");
    });
  });

  // ========== 手机号已被占用 ==========

  describe("手机号唯一性检查", () => {
    it("应在手机号已被其他用户绑定时返回 409", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockVerifyCode.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({ id: "user-2", phone: "13800138000" });

      const req = createRequest({ phone: "13800138000", code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe("该手机号已被其他账户绑定");
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("应允许用户重新绑定自己已绑定的手机号", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockVerifyCode.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({ id: "user-1", phone: "13800138000" });
      mockUpdate.mockResolvedValue({ id: "user-1", phone: "13800138000" });

      const req = createRequest({ phone: "13800138000", code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ success: true });
    });
  });

  // ========== 成功绑定 ==========

  describe("成功绑定手机号", () => {
    it("应成功绑定手机号并返回 success", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockVerifyCode.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue(null);
      mockUpdate.mockResolvedValue({ id: "user-1", phone: "13800138000" });

      const req = createRequest({ phone: "13800138000", code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockVerifyCode).toHaveBeenCalledWith("13800138000", "888888", "bindphone");
      expect(mockFindFirst).toHaveBeenCalledWith({ where: { phone: "13800138000" } });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { phone: "13800138000" },
      });
    });
  });

  // ========== 服务器错误 ==========

  describe("服务器错误", () => {
    it("应在 verifyCode 抛出异常时返回 500", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockVerifyCode.mockRejectedValue(new Error("Redis connection failed"));

      const req = createRequest({ phone: "13800138000", code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("服务器错误，请稍后再试");
    });

    it("应在 prisma.user.update 抛出异常时返回 500", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockVerifyCode.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue(null);
      mockUpdate.mockRejectedValue(new Error("Database error"));

      const req = createRequest({ phone: "13800138000", code: "888888" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("服务器错误，请稍后再试");
    });
  });
});

// ========== Property-Based Tests ==========

import * as fc from "fast-check";

/**
 * Generate valid Chinese phone numbers: 1[3-9] followed by 9 digits.
 */
const chinesePhoneArb = fc
  .tuple(
    fc.integer({ min: 3, max: 9 }),
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 9 })
  )
  .map(([second, rest]) => `1${second}${rest.join("")}`);

/**
 * Generate random user IDs (UUID-like strings).
 */
const userIdArb = fc.uuid();

// Feature: multi-auth-login, Property 12: 手机号唯一性约束
// *For any* 已被用户 A 绑定的手机号，当用户 B 尝试绑定同一手机号时，绑定操作应失败并返回错误。
// **Validates: Requirements 5.4, 5.5**
describe("Property 12: 手机号唯一性约束", () => {
  it("已绑定手机号被其他用户绑定时应返回 409", async () => {
    await fc.assert(
      fc.asyncProperty(
        chinesePhoneArb,
        userIdArb,
        userIdArb,
        async (phone, userAId, userBId) => {
          // Ensure user A and user B are different
          fc.pre(userAId !== userBId);

          vi.clearAllMocks();

          // User B is logged in
          mockGetToken.mockResolvedValue({ id: userBId });
          // Verification code is valid
          mockVerifyCode.mockResolvedValue(true);
          // Phone is already bound to user A
          mockFindFirst.mockResolvedValue({ id: userAId, phone });

          const req = createRequest({ phone, code: "888888" });
          const res = await POST(req);
          const data = await res.json();

          expect(res.status).toBe(409);
          expect(data.error).toBe("该手机号已被其他账户绑定");
          expect(mockUpdate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: multi-auth-login, Property 14: 手机号绑定 Round-Trip
// *For any* 已登录用户和有效手机号，完成验证码验证并绑定后，查询该用户的 phone 字段应等于绑定时提交的手机号。
// **Validates: Requirements 5.4, 5.5**
describe("Property 14: 手机号绑定 Round-Trip", () => {
  it("绑定后 update 应使用提交的手机号，且返回 success", async () => {
    await fc.assert(
      fc.asyncProperty(
        chinesePhoneArb,
        userIdArb,
        async (phone, userId) => {
          vi.clearAllMocks();

          // User is logged in
          mockGetToken.mockResolvedValue({ id: userId });
          // Verification code is valid
          mockVerifyCode.mockResolvedValue(true);
          // Phone is not taken by anyone
          mockFindFirst.mockResolvedValue(null);
          // Capture the update call
          mockUpdate.mockResolvedValue({ id: userId, phone });

          const req = createRequest({ phone, code: "888888" });
          const res = await POST(req);
          const data = await res.json();

          // Verify response
          expect(res.status).toBe(200);
          expect(data).toEqual({ success: true });

          // Verify the phone was saved correctly via prisma update
          expect(mockUpdate).toHaveBeenCalledTimes(1);
          expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: userId },
            data: { phone },
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
