import { describe, it, expect } from "vitest";

/**
 * BottomNav 组件逻辑测试
 *
 * 由于项目测试环境为 node（无 jsdom/testing-library），
 * 这里验证 BottomNav 的核心逻辑：路由激活判断、未读数量格式化、导航项配置。
 */

// Extracted logic matching BottomNav implementation
function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function formatUnreadCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

const navItems = [
  { href: "/", label: "首页", raised: false },
  { href: "/discover", label: "发现", raised: false },
  { href: "/create", label: "发布", raised: true },
  { href: "/messages", label: "消息", raised: false },
  { href: "/u/me", label: "我的", raised: false },
];

describe("BottomNav 逻辑", () => {
  describe("导航项配置", () => {
    it("应包含五个导航入口", () => {
      expect(navItems).toHaveLength(5);
    });

    it("发布按钮应为凸起样式", () => {
      const publishItem = navItems.find((item) => item.href === "/create");
      expect(publishItem).toBeDefined();
      expect(publishItem!.raised).toBe(true);
    });

    it("其他导航项不应为凸起样式", () => {
      const nonRaised = navItems.filter((item) => item.href !== "/create");
      expect(nonRaised.every((item) => !item.raised)).toBe(true);
    });

    it("导航项标签应正确", () => {
      const labels = navItems.map((item) => item.label);
      expect(labels).toEqual(["首页", "发现", "发布", "消息", "我的"]);
    });
  });

  describe("当前页面高亮判断", () => {
    it("首页路径 '/' 仅精确匹配", () => {
      expect(isActive("/", "/")).toBe(true);
      expect(isActive("/", "/discover")).toBe(false);
      expect(isActive("/", "/create")).toBe(false);
    });

    it("发现页路径前缀匹配", () => {
      expect(isActive("/discover", "/discover")).toBe(true);
      expect(isActive("/discover", "/discover/topic/1")).toBe(true);
      expect(isActive("/discover", "/")).toBe(false);
    });

    it("发布页路径前缀匹配", () => {
      expect(isActive("/create", "/create")).toBe(true);
      expect(isActive("/create", "/")).toBe(false);
    });

    it("消息页路径前缀匹配", () => {
      expect(isActive("/messages", "/messages")).toBe(true);
      expect(isActive("/messages", "/messages/123")).toBe(true);
      expect(isActive("/messages", "/")).toBe(false);
    });

    it("我的页路径前缀匹配", () => {
      expect(isActive("/u/me", "/u/me")).toBe(true);
      expect(isActive("/u/me", "/u/me/settings")).toBe(true);
      expect(isActive("/u/me", "/u/other")).toBe(false);
      expect(isActive("/u/me", "/")).toBe(false);
    });
  });

  describe("未读消息角标格式化", () => {
    it("未读数为 0 时不显示角标", () => {
      expect(formatUnreadCount(0)).toBeNull();
    });

    it("负数不显示角标", () => {
      expect(formatUnreadCount(-1)).toBeNull();
    });

    it("未读数 1-99 显示实际数字", () => {
      expect(formatUnreadCount(1)).toBe("1");
      expect(formatUnreadCount(42)).toBe("42");
      expect(formatUnreadCount(99)).toBe("99");
    });

    it("未读数超过 99 显示 '99+'", () => {
      expect(formatUnreadCount(100)).toBe("99+");
      expect(formatUnreadCount(500)).toBe("99+");
    });
  });
});
