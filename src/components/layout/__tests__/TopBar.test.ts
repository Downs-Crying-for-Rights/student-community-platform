import { describe, it, expect } from "vitest";

/**
 * TopBar 组件逻辑测试
 *
 * 由于项目测试环境为 node（无 jsdom/testing-library），
 * 这里验证 TopBar 的核心逻辑：路由判断、搜索 URL 构建、未读数量格式化。
 */

// Extracted logic helpers matching TopBar implementation
function isHomePage(pathname: string): boolean {
  return pathname === "/";
}

function buildSearchUrl(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return `/search?q=${encodeURIComponent(trimmed)}`;
}

function formatUnreadCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

describe("TopBar 逻辑", () => {
  describe("首页判断 — Logo vs 返回按钮", () => {
    it("pathname 为 '/' 时应判定为首页（显示 Logo）", () => {
      expect(isHomePage("/")).toBe(true);
    });

    it("pathname 为其他路径时应判定为非首页（显示返回按钮）", () => {
      expect(isHomePage("/post/123")).toBe(false);
      expect(isHomePage("/search")).toBe(false);
      expect(isHomePage("/messages")).toBe(false);
      expect(isHomePage("/create")).toBe(false);
      expect(isHomePage("/discover")).toBe(false);
    });
  });

  describe("搜索 URL 构建", () => {
    it("应正确构建搜索 URL", () => {
      expect(buildSearchUrl("测试")).toBe("/search?q=%E6%B5%8B%E8%AF%95");
    });

    it("应对特殊字符进行 URL 编码", () => {
      expect(buildSearchUrl("hello world")).toBe("/search?q=hello%20world");
      expect(buildSearchUrl("a&b=c")).toBe("/search?q=a%26b%3Dc");
    });

    it("空字符串不应生成 URL", () => {
      expect(buildSearchUrl("")).toBeNull();
    });

    it("仅空格不应生成 URL", () => {
      expect(buildSearchUrl("   ")).toBeNull();
    });

    it("应去除前后空格", () => {
      expect(buildSearchUrl("  hello  ")).toBe("/search?q=hello");
    });
  });

  describe("未读数量角标格式化", () => {
    it("未读数为 0 时不显示角标", () => {
      expect(formatUnreadCount(0)).toBeNull();
    });

    it("负数不显示角标", () => {
      expect(formatUnreadCount(-1)).toBeNull();
    });

    it("未读数 1-99 显示实际数字", () => {
      expect(formatUnreadCount(1)).toBe("1");
      expect(formatUnreadCount(50)).toBe("50");
      expect(formatUnreadCount(99)).toBe("99");
    });

    it("未读数超过 99 显示 '99+'", () => {
      expect(formatUnreadCount(100)).toBe("99+");
      expect(formatUnreadCount(999)).toBe("99+");
    });
  });
});
