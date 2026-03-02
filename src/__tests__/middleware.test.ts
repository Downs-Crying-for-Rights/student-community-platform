import { describe, it, expect } from "vitest";
import { config, BINDPHONE_WHITELIST, isBindphoneWhitelisted } from "../middleware";

describe("认证中间件", () => {
  describe("路由匹配规则", () => {
    const matchers = config.matcher;

    it("应包含所有受保护路由", () => {
      expect(matchers).toContain("/create");
      expect(matchers).toContain("/messages");
      expect(matchers).toContain("/settings/:path*");
      expect(matchers).toContain("/admin/:path*");
      expect(matchers).toContain("/moderation");
      expect(matchers).toContain("/dcr/:path*");
      expect(matchers).toContain("/apply");
      expect(matchers).toContain("/u/:path*");
      expect(matchers).toContain("/onboarding");
      expect(matchers).toContain("/bindphone");
    });

    it("不应包含公开路由", () => {
      const matcherStr = JSON.stringify(matchers);
      // Public routes should NOT be in the matcher
      expect(matcherStr).not.toContain('"/login"');
      expect(matcherStr).not.toContain('"/search"');
      expect(matcherStr).not.toContain('"/discover"');
      expect(matcherStr).not.toContain('"/kb');
      expect(matcherStr).not.toContain('"/help');
      expect(matcherStr).not.toContain('"/api/auth');
    });

    it("不应匹配根路径", () => {
      expect(matchers).not.toContain("/");
    });

    it("应使用通配符匹配 settings 子路由", () => {
      expect(matchers).toContain("/settings/:path*");
    });

    it("应使用通配符匹配 admin 子路由", () => {
      expect(matchers).toContain("/admin/:path*");
    });

    it("应使用通配符匹配 dcr 子路由", () => {
      expect(matchers).toContain("/dcr/:path*");
    });
  });

  describe("手机号绑定白名单", () => {
    it("应包含所有白名单路径", () => {
      expect(BINDPHONE_WHITELIST).toContain("/api/auth");
      expect(BINDPHONE_WHITELIST).toContain("/api/sms");
      expect(BINDPHONE_WHITELIST).toContain("/bindphone");
      expect(BINDPHONE_WHITELIST).toContain("/logout");
      expect(BINDPHONE_WHITELIST).toContain("/login");
    });

    it("白名单路径应被放行", () => {
      expect(isBindphoneWhitelisted("/api/auth")).toBe(true);
      expect(isBindphoneWhitelisted("/api/auth/callback/email")).toBe(true);
      expect(isBindphoneWhitelisted("/api/sms")).toBe(true);
      expect(isBindphoneWhitelisted("/api/sms/send")).toBe(true);
      expect(isBindphoneWhitelisted("/bindphone")).toBe(true);
      expect(isBindphoneWhitelisted("/logout")).toBe(true);
      expect(isBindphoneWhitelisted("/login")).toBe(true);
    });

    it("非白名单路径不应被放行", () => {
      expect(isBindphoneWhitelisted("/create")).toBe(false);
      expect(isBindphoneWhitelisted("/messages")).toBe(false);
      expect(isBindphoneWhitelisted("/settings/profile")).toBe(false);
      expect(isBindphoneWhitelisted("/admin/users")).toBe(false);
      expect(isBindphoneWhitelisted("/onboarding")).toBe(false);
      expect(isBindphoneWhitelisted("/u/123")).toBe(false);
    });
  });
});
