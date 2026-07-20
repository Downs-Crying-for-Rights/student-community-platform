import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password"),
  },
}));

const mockVerifyCode = vi.fn();
vi.mock("@/lib/sms/verification", () => ({
  verifyCode: (...args: unknown[]) => mockVerifyCode(...args),
}));

// Mock Prisma client
const mockFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockSessionCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    inviteCode: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const validBody = {
  inviteCode: "VALID123",
  email: "test@example.com",
  password: "password123",
  nickname: "测试用户",
  phone: "13800138000",
  code: "123456",
};

// Helper to create a NextRequest with JSON body
function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/invite", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// Helper to build a valid invite code record
function buildInviteCode(overrides: Record<string, unknown> = {}) {
  return {
    id: "cltest123",
    code: "VALID123",
    isUsed: false,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
    createdAt: new Date(),
    usedAt: null,
    creatorId: "creator1",
    usedById: null,
    ...overrides,
  };
}

describe("POST /api/auth/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(null); // no existing email
    mockUserFindFirst.mockResolvedValue(null); // no existing phone
    mockVerifyCode.mockResolvedValue(true);
  });

  // ========== 邀请码格式验证 ==========

  describe("邀请码格式验证", () => {
    it("应拒绝空邀请码", async () => {
      const req = createRequest({ ...validBody, inviteCode: "" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });

    it("应拒绝过短的邀请码（少于6字符）", async () => {
      const req = createRequest({ ...validBody, inviteCode: "AB12" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });

    it("应拒绝过长的邀请码（超过32字符）", async () => {
      const req = createRequest({ ...validBody, inviteCode: "A".repeat(33) });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });

    it("应拒绝缺少inviteCode字段的请求", async () => {
      const { inviteCode, ...rest } = validBody;
      const req = createRequest(rest);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });
  });

  // ========== 身份信息校验 ==========

  describe("身份信息校验", () => {
    it("应拒绝缺少 email 的请求", async () => {
      const { email, ...rest } = validBody;
      const req = createRequest(rest);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });

    it("应拒绝缺少 password 的请求", async () => {
      const { password, ...rest } = validBody;
      const req = createRequest(rest);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });

  });

  // ========== 邀请码有效性验证 ==========

  describe("邀请码有效性验证", () => {
    it("应拒绝不存在的邀请码", async () => {
      mockFindUnique.mockResolvedValue(null);

      const req = createRequest(validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("邀请码无效");
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { code: "VALID123" },
      });
    });

    it("应拒绝已使用的邀请码", async () => {
      mockFindUnique.mockResolvedValue(
        buildInviteCode({ isUsed: true, usedAt: new Date() })
      );

      const req = createRequest(validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("邀请码已被使用");
    });

    it("应拒绝已撤销的邀请码", async () => {
      mockFindUnique.mockResolvedValue(
        buildInviteCode({ isRevoked: true })
      );

      const req = createRequest(validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("邀请码已被撤销");
    });

    it("应拒绝已过期的邀请码", async () => {
      mockFindUnique.mockResolvedValue(
        buildInviteCode({
          expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
        })
      );

      const req = createRequest(validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("邀请码已过期");
    });
  });

  // ========== 唯一性检查 ==========

  describe("唯一性检查", () => {
    it("应拒绝已注册的邮箱", async () => {
      mockFindUnique.mockResolvedValue(buildInviteCode());
      mockUserFindUnique.mockResolvedValue({ id: "existing-user" });

      const req = createRequest(validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe("该邮箱已被注册");
    });

  });

  // ========== 成功注册流程 ==========

  describe("成功注册流程", () => {
    it("应使用有效邀请码成功创建用户", async () => {
      const inviteCode = buildInviteCode();
      mockFindUnique.mockResolvedValue(inviteCode);

      const mockUser = { id: "newuser1" };
      const mockSessionToken = "mock-session-token";

      mockTransaction.mockImplementation(async (fn: Function) => {
        const tx = {
          user: {
            create: mockCreate.mockResolvedValue(mockUser),
          },
          inviteCode: {
            update: mockUpdate.mockResolvedValue({}),
          },
          session: {
            create: mockSessionCreate.mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      const req = createRequest(validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.message).toBe("注册成功");
      expect(data.userId).toBe("newuser1");

      // 邀请码只授予注册资格，DCR 权限仍需走统一安全准入流程。
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          email: "test@example.com",
          passwordHash: "hashed_password",
          nickname: "测试用户",
          phone: "13800138000",
          profileCompletionRequired: true,
          isAnonymous: false,
        },
      });

      // Verify bcrypt.hash was called with the password
      const bcrypt = await import("bcryptjs");
      expect(bcrypt.default.hash).toHaveBeenCalledWith("password123", 10);

      // Verify invite code was marked as used
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: inviteCode.id },
          data: expect.objectContaining({
            isUsed: true,
            usedById: mockUser.id,
          }),
        })
      );

      // JWT 会话由前端注册成功后通过 Credentials Provider 创建。
      expect(mockSessionCreate).not.toHaveBeenCalled();
      expect(mockVerifyCode).toHaveBeenCalledWith("13800138000", "123456", "register");
    });

    it("成功注册后不应写入数据库 Session cookie", async () => {
      const inviteCode = buildInviteCode();
      mockFindUnique.mockResolvedValue(inviteCode);

      mockTransaction.mockImplementation(async (fn: Function) => {
        const tx = {
          user: { create: mockCreate.mockResolvedValue({ id: "user1" }) },
          inviteCode: { update: mockUpdate.mockResolvedValue({}) },
          session: { create: mockSessionCreate.mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const req = createRequest(validBody);
      const res = await POST(req);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeNull();
    });
  });

  // ========== 事务管理 ==========

  describe("事务管理", () => {
    it("应在事务中同时创建用户并更新邀请码，但不创建数据库会话", async () => {
      const inviteCode = buildInviteCode();
      mockFindUnique.mockResolvedValue(inviteCode);

      mockTransaction.mockImplementation(async (fn: Function) => {
        const tx = {
          user: { create: mockCreate.mockResolvedValue({ id: "user1" }) },
          inviteCode: { update: mockUpdate.mockResolvedValue({}) },
          session: { create: mockSessionCreate.mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const req = createRequest(validBody);
      await POST(req);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockSessionCreate).not.toHaveBeenCalled();
    });
  });

  // ========== 错误处理 ==========

  describe("错误处理", () => {
    it("应在数据库错误时返回500", async () => {
      mockFindUnique.mockRejectedValue(new Error("DB connection failed"));

      const req = createRequest(validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("服务器内部错误，请稍后重试");
    });

    it("应在事务失败时返回500", async () => {
      mockFindUnique.mockResolvedValue(buildInviteCode());
      mockTransaction.mockRejectedValue(new Error("Transaction failed"));

      const req = createRequest(validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("服务器内部错误，请稍后重试");
    });
  });
});
