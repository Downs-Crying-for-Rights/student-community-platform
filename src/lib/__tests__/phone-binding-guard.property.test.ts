import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  BINDPHONE_WHITELIST,
  isBindphoneWhitelisted,
} from "../../middleware";

// ==================== Generators ====================

/** Generate a random suffix to append to whitelist prefixes */
const arbPathSuffix = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^\/[a-z0-9\-_/]{0,30}$/),
);

/** Generate a path that starts with one of the whitelist prefixes */
const arbWhitelistedPath = fc
  .tuple(
    fc.constantFrom(...BINDPHONE_WHITELIST),
    arbPathSuffix,
  )
  .map(([prefix, suffix]) => `${prefix}${suffix}`);

/**
 * Generate a path that does NOT start with any whitelist prefix.
 * Strategy: pick from known non-whitelisted prefixes and append random segments.
 */
const NON_WHITELISTED_PREFIXES = [
  "/create",
  "/messages",
  "/settings",
  "/admin",
  "/moderation",
  "/dcr",
  "/apply",
  "/u",
  "/onboarding",
  "/dashboard",
  "/profile",
];

const arbNonWhitelistedPath = fc
  .tuple(
    fc.constantFrom(...NON_WHITELISTED_PREFIXES),
    arbPathSuffix,
  )
  .map(([prefix, suffix]) => `${prefix}${suffix}`);

// ==================== Property 10: 手机号绑定守卫路由规则 ====================
// Feature: multi-auth-login, Property 10: 手机号绑定守卫路由规则
// **Validates: Requirements 5.1, 5.6, 5.7**

describe("属性 10: 手机号绑定守卫路由规则", () => {
  it("白名单前缀路径应被放行（返回 true）", () => {
    fc.assert(
      fc.property(arbWhitelistedPath, (path) => {
        expect(isBindphoneWhitelisted(path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("非白名单路径应被拦截（返回 false）", () => {
    fc.assert(
      fc.property(arbNonWhitelistedPath, (path) => {
        // Verify none of the non-whitelisted prefixes start with a whitelist prefix
        const startsWithWhitelist = BINDPHONE_WHITELIST.some((wp) =>
          path.startsWith(wp)
        );
        expect(startsWithWhitelist).toBe(false);
        expect(isBindphoneWhitelisted(path)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
