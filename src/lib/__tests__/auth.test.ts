import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing auth config
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(),
    })),
  },
}));

vi.mock("next-auth/providers/email", () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    id: "email",
    type: "email",
    ...config,
  })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    id: config.id ?? "credentials",
    type: "credentials",
    ...config,
  })),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock("@/lib/sms/verification", () => ({
  verifyCode: vi.fn(),
}));

import { authOptions } from "../auth";
import bcrypt from "bcryptjs";
import { verifyCode } from "@/lib/sms/verification";
import QQProvider, { parseCallbackResponse } from "../auth/qq-provider";

describe("NextAuth 配置", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: findUnique returns a basic user for jwt callback
    mockFindUnique.mockResolvedValue({ role: "USER", phone: null });
  });

  describe("魔法链接配置", () => {
    it("应配置15分钟的魔法链接有效期", () => {
      const emailProvider = authOptions.providers[0] as unknown as Record<string, unknown>;
      expect(emailProvider.maxAge).toBe(15 * 60);
    });

    it("应使用 JWT 会话策略", () => {
      expect(authOptions.session?.strategy).toBe("jwt");
    });

    it("应配置登录页面路由为 /login", () => {
      expect(authOptions.pages?.signIn).toBe("/login");
    });

    it("应配置验证请求页面路由", () => {
      expect(authOptions.pages?.verifyRequest).toBe("/login?verify=true");
    });

    it("应配置错误页面路由为 /login", () => {
      expect(authOptions.pages?.error).toBe("/login");
    });
  });

  describe("会话回调", () => {
    it("应在会话回调中从 token 注入用户信息", async () => {
      const sessionCallback = authOptions.callbacks?.session;
      expect(sessionCallback).toBeDefined();

      if (sessionCallback) {
        const mockSession = { user: { id: "", role: "", phone: null } } as any;
        const mockToken = { id: "test-user-id", role: "USER", phone: "13800138000" } as any;

        const result = await sessionCallback({
          session: mockSession,
          user: {} as any,
          token: mockToken,
          trigger: "update",
          newSession: undefined,
        });

        expect((result.user as any).id).toBe("test-user-id");
        expect((result.user as any).role).toBe("USER");
        expect((result.user as any).phone).toBe("13800138000");
      }
    });

    it("应在 jwt 回调中注入用户信息（首次登录）", async () => {
      const jwtCallback = authOptions.callbacks?.jwt;
      expect(jwtCallback).toBeDefined();

      if (jwtCallback) {
        const mockToken = {} as any;
        const mockUser = { id: "test-user-id" } as any;

        const result = await jwtCallback({
          token: mockToken,
          user: mockUser,
          account: null,
          trigger: "signIn",
        });

        expect(result.id).toBe("test-user-id");
        expect(result.role).toBe("USER");
      }
    });

    it("应在 jwt 回调中保持已有 token 不变（后续请求）", async () => {
      const jwtCallback = authOptions.callbacks?.jwt;
      expect(jwtCallback).toBeDefined();

      if (jwtCallback) {
        const mockToken = { id: "existing-id", role: "ADMIN", phone: "13800138000" } as any;

        const result = await jwtCallback({
          token: mockToken,
          user: undefined as any,
          account: null,
          trigger: "update",
        });

        expect(result.id).toBe("existing-id");
        expect(result.role).toBe("ADMIN");
        expect(result.phone).toBe("13800138000");
      }
    });
  });

  describe("QQ Provider 配置", () => {
    it("应配置 provider id 为 qq", () => {
      const qqProvider = QQProvider({ clientId: "test-id", clientSecret: "test-secret" });
      expect(qqProvider.id).toBe("qq");
      expect(qqProvider.name).toBe("QQ");
      expect(qqProvider.type).toBe("oauth");
    });

    it("应正确配置授权端点", () => {
      const qqProvider = QQProvider({ clientId: "test-id", clientSecret: "test-secret" });
      const auth = qqProvider.authorization as { url: string; params: Record<string, string> };
      expect(auth.url).toBe("https://graph.qq.com/oauth2.0/authorize");
      expect(auth.params.scope).toBe("get_user_info");
    });

    it("profile 回调应正确映射 QQ 用户信息", () => {
      const qqProvider = QQProvider({ clientId: "test-id", clientSecret: "test-secret" });
      const profile = qqProvider.profile!({
        openid: "qq-openid-123",
        nickname: "测试用户",
        figureurl_qq_2: "https://example.com/avatar.jpg",
      } as any);

      expect(profile.id).toBe("qq-openid-123");
      expect(profile.name).toBe("测试用户");
      expect(profile.image).toBe("https://example.com/avatar.jpg");
    });
  });

  describe("parseCallbackResponse 工具函数", () => {
    it("应正确解析 QQ callback 格式响应", () => {
      const text = 'callback( {"client_id":"12345","openid":"ABCDEF"} );';
      const result = parseCallbackResponse(text);
      expect(result.client_id).toBe("12345");
      expect(result.openid).toBe("ABCDEF");
    });

    it("应在无效格式时抛出错误", () => {
      expect(() => parseCallbackResponse("invalid response")).toThrow(
        "Failed to parse QQ callback response"
      );
    });

    it("应处理包含空格的 callback 响应", () => {
      const text = 'callback(  { "openid": "test-123" }  );';
      const result = parseCallbackResponse(text);
      expect(result.openid).toBe("test-123");
    });
  });

  describe("密码登录 authorize", () => {
    // Get the credentials-password provider's authorize function
    const getPasswordAuthorize = () => {
      const provider = authOptions.providers.find(
        (p: any) => p.id === "credentials-password"
      ) as any;
      return provider.authorize as (credentials: any) => Promise<any>;
    };

    it("正确密码应返回用户对象", async () => {
      const authorize = getPasswordAuthorize();
      mockFindUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        nickname: "测试用户",
        role: "USER",
        phone: "13800138000",
        passwordHash: "$2b$10$hashedpassword",
      });
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

      const result = await authorize({
        email: "test@example.com",
        password: "validPassword123",
      });

      expect(result).toEqual({
        id: "user-1",
        email: "test@example.com",
        name: "测试用户",
        role: "USER",
        phone: "13800138000",
      });
    });

    it("错误密码应抛出 '邮箱或密码错误'", async () => {
      const authorize = getPasswordAuthorize();
      mockFindUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        nickname: "测试用户",
        role: "USER",
        phone: null,
        passwordHash: "$2b$10$hashedpassword",
      });
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

      await expect(
        authorize({ email: "test@example.com", password: "wrongPassword" })
      ).rejects.toThrow("邮箱或密码错误");
    });

    it("不存在的邮箱应抛出 '邮箱或密码错误'", async () => {
      const authorize = getPasswordAuthorize();
      mockFindUnique.mockResolvedValueOnce(null);

      await expect(
        authorize({ email: "nonexistent@example.com", password: "anyPassword" })
      ).rejects.toThrow("邮箱或密码错误");
    });

    it("用户无 passwordHash 应抛出 '邮箱或密码错误'", async () => {
      const authorize = getPasswordAuthorize();
      mockFindUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        nickname: "测试用户",
        role: "USER",
        phone: null,
        passwordHash: null,
      });

      await expect(
        authorize({ email: "test@example.com", password: "anyPassword" })
      ).rejects.toThrow("邮箱或密码错误");
    });
  });

  describe("手机号验证码登录 authorize", () => {
    const getSmsAuthorize = () => {
      const provider = authOptions.providers.find(
        (p: any) => p.id === "credentials-sms"
      ) as any;
      return provider.authorize as (credentials: any) => Promise<any>;
    };

    it("正确验证码应返回用户对象", async () => {
      const authorize = getSmsAuthorize();
      vi.mocked(verifyCode).mockResolvedValueOnce(true);
      mockFindFirst.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        nickname: "测试用户",
        role: "USER",
        phone: "13800138000",
      });

      const result = await authorize({
        phone: "13800138000",
        code: "888888",
      });

      expect(result).toEqual({
        id: "user-1",
        email: "test@example.com",
        name: "测试用户",
        role: "USER",
        phone: "13800138000",
      });
      expect(verifyCode).toHaveBeenCalledWith("13800138000", "888888", "login");
    });

    it("错误验证码应抛出 '验证码错误或已过期'", async () => {
      const authorize = getSmsAuthorize();
      vi.mocked(verifyCode).mockResolvedValueOnce(false);

      await expect(
        authorize({ phone: "13800138000", code: "000000" })
      ).rejects.toThrow("验证码错误或已过期");
    });

    it("手机号不存在时应自动创建新用户", async () => {
      const authorize = getSmsAuthorize();
      vi.mocked(verifyCode).mockResolvedValueOnce(true);
      mockFindFirst.mockResolvedValueOnce(null); // No existing user
      mockCreate.mockResolvedValueOnce({
        id: "new-user-1",
        email: null,
        nickname: null,
        role: "USER",
        phone: "13900139000",
      });

      const result = await authorize({
        phone: "13900139000",
        code: "888888",
      });

      expect(result).toEqual({
        id: "new-user-1",
        email: null,
        name: null,
        role: "USER",
        phone: "13900139000",
      });
      expect(mockCreate).toHaveBeenCalledWith({
        data: { phone: "13900139000" },
        select: { id: true, email: true, nickname: true, role: true, phone: true },
      });
    });
  });
});
