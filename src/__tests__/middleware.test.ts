import { describe, it, expect } from "vitest";
import { config, AUTH_WHITELIST, isAuthWhitelisted } from "../middleware";

describe("认证中间件", () => {
  describe("路由匹配规则", () => {
    const matchers = config.matcher;

    it("应包含所有受保护路由", () => {
      expect(matchers).toContain("/");
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
      expect(matchers).toContain("/set-username");
      expect(matchers).toContain("/discover");
      expect(matchers).toContain("/search");
      expect(matchers).toContain("/chat/:path*");
      expect(matchers).toContain("/psych/:path*");
      expect(matchers).toContain("/post/:path*");
      expect(matchers).toContain("/kb/:path*");
      expect(matchers).toContain("/help/:path*");
    });

    it("不应包含公开路由", () => {
      const matcherStr = JSON.stringify(matchers);
      // Login and API routes should NOT be in the matcher
      expect(matcherStr).not.toContain('"/login"');
      expect(matcherStr).not.toContain('"/api/auth');
    });

    it("根路径应在匹配器中", () => {
      expect(matchers).toContain("/");
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

  describe("认证白名单", () => {
    it("应包含所有白名单路径", () => {
      expect(AUTH_WHITELIST).toContain("/api/auth");
      expect(AUTH_WHITELIST).toContain("/api/sms");
      expect(AUTH_WHITELIST).toContain("/bindphone");
      expect(AUTH_WHITELIST).toContain("/onboarding");
      expect(AUTH_WHITELIST).toContain("/api/onboarding");
      expect(AUTH_WHITELIST).toContain("/logout");
      expect(AUTH_WHITELIST).toContain("/login");
      expect(AUTH_WHITELIST).toContain("/set-username");
    });

    it("白名单路径应被放行（前缀匹配）", () => {
      expect(isAuthWhitelisted("/api/auth")).toBe(true);
      expect(isAuthWhitelisted("/api/auth/callback/email")).toBe(true);
      expect(isAuthWhitelisted("/api/sms")).toBe(true);
      expect(isAuthWhitelisted("/api/sms/send")).toBe(true);
      expect(isAuthWhitelisted("/bindphone")).toBe(true);
      expect(isAuthWhitelisted("/onboarding")).toBe(true);
      expect(isAuthWhitelisted("/api/onboarding")).toBe(true);
      expect(isAuthWhitelisted("/api/onboarding/complete")).toBe(true);
      expect(isAuthWhitelisted("/logout")).toBe(true);
      expect(isAuthWhitelisted("/login")).toBe(true);
      expect(isAuthWhitelisted("/set-username")).toBe(true);
    });

    it("非白名单路径不应被放行", () => {
      expect(isAuthWhitelisted("/create")).toBe(false);
      expect(isAuthWhitelisted("/messages")).toBe(false);
      expect(isAuthWhitelisted("/settings/profile")).toBe(false);
      expect(isAuthWhitelisted("/admin/users")).toBe(false);
      expect(isAuthWhitelisted("/u/123")).toBe(false);
    });
  });
});
