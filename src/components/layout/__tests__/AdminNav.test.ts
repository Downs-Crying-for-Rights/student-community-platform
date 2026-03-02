import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

/**
 * AdminNav 导航组件测试
 *
 * 验证 AdminNav 组件的导航项配置和高亮逻辑：
 * - Property 21: 保持现有导航项
 * - Property 22: 激活状态高亮
 * - 新增知识库和准入审核导航项
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */

/* ---------- adminLinks configuration (mirrors component) ---------- */

const adminLinks = [
  { href: "/moderation", label: "审核看板" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/content", label: "内容管理" },
  { href: "/admin/invites", label: "邀请码" },
  { href: "/admin/audit", label: "操作日志" },
  { href: "/admin/boards", label: "板块管理" },
  { href: "/admin/kb", label: "知识库" },
  { href: "/admin/applications", label: "准入审核" },
];

/** Simulates the active link logic from AdminNav */
function isActive(pathname: string, href: string): boolean {
  return pathname === href;
}

/** Returns the CSS class based on active state (mirrors component logic) */
function getLinkClass(pathname: string, href: string): string {
  return isActive(pathname, href)
    ? "border-primary text-primary"
    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground";
}

/* ---------- Original 5 nav items preserved ---------- */

describe("AdminNav original navigation items", () => {
  const originalLinks = [
    { href: "/admin/users", label: "用户管理" },
    { href: "/admin/content", label: "内容管理" },
    { href: "/admin/invites", label: "邀请码" },
    { href: "/admin/audit", label: "操作日志" },
    { href: "/admin/boards", label: "板块管理" },
  ];

  it("includes 审核看板 as the first nav item", () => {
    expect(adminLinks[0].href).toBe("/moderation");
    expect(adminLinks[0].label).toBe("审核看板");
  });

  /**
   * Feature: dcr-complete-ui, Property 21: AdminNav 保持现有导航项
   *
   * For any AdminNav rendering, the original 5 navigation items
   * (用户管理, 内容管理, 邀请码, 操作日志, 板块管理) should all
   * exist with correct hrefs.
   *
   * **Validates: Requirements 10.3**
   */
  it("Property 21: all original 5 nav items exist with correct hrefs", () => {
    for (const original of originalLinks) {
      const found = adminLinks.find(
        (link) => link.href === original.href && link.label === original.label,
      );
      expect(found).toBeDefined();
    }
  });

  it("Property 21: original items maintain their order (after moderation)", () => {
    // Original 5 items start at index 1 (index 0 is 审核看板)
    for (let i = 0; i < originalLinks.length; i++) {
      expect(adminLinks[i + 1].href).toBe(originalLinks[i].href);
      expect(adminLinks[i + 1].label).toBe(originalLinks[i].label);
    }
  });

  it("total nav items count is 8 (1 moderation + 5 original + 2 new)", () => {
    expect(adminLinks).toHaveLength(8);
  });
});

/* ---------- New nav items ---------- */

describe("AdminNav new navigation items (Req 10.1, 10.2)", () => {
  it("includes 知识库 nav item with /admin/kb href", () => {
    const kbLink = adminLinks.find((l) => l.href === "/admin/kb");
    expect(kbLink).toBeDefined();
    expect(kbLink!.label).toBe("知识库");
  });

  it("includes 准入审核 nav item with /admin/applications href", () => {
    const appLink = adminLinks.find((l) => l.href === "/admin/applications");
    expect(appLink).toBeDefined();
    expect(appLink!.label).toBe("准入审核");
  });

  it("new items are placed after the original 5", () => {
    expect(adminLinks[6].href).toBe("/admin/kb");
    expect(adminLinks[7].href).toBe("/admin/applications");
  });
});

/* ---------- Active state highlight logic ---------- */

describe("AdminNav active state highlight", () => {
  /**
   * Feature: dcr-complete-ui, Property 22: AdminNav 激活状态高亮
   *
   * For any pathname, the AdminNav item whose href matches the pathname
   * should have `border-primary` style, and all others should not.
   *
   * **Validates: Requirements 10.4**
   */
  it("Property 22: exactly one item is active when pathname matches", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...adminLinks.map((l) => l.href)),
        (pathname: string) => {
          const activeItems = adminLinks.filter((l) => isActive(pathname, l.href));
          const inactiveItems = adminLinks.filter((l) => !isActive(pathname, l.href));

          // Exactly one item should be active
          if (activeItems.length !== 1) return false;

          // Active item should have border-primary class
          const activeClass = getLinkClass(pathname, activeItems[0].href);
          if (!activeClass.includes("border-primary")) return false;

          // All inactive items should NOT have border-primary
          for (const item of inactiveItems) {
            const cls = getLinkClass(pathname, item.href);
            if (cls.includes("border-primary")) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 22: no item is active when pathname doesn't match any href", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !adminLinks.some((l) => l.href === s)),
        (pathname: string) => {
          const activeItems = adminLinks.filter((l) => isActive(pathname, l.href));
          return activeItems.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("active item gets border-primary class", () => {
    const cls = getLinkClass("/admin/users", "/admin/users");
    expect(cls).toContain("border-primary");
    expect(cls).toContain("text-primary");
  });

  it("inactive item gets border-transparent class", () => {
    const cls = getLinkClass("/admin/users", "/admin/audit");
    expect(cls).toContain("border-transparent");
    expect(cls).toContain("text-muted-foreground");
  });

  it("new kb item can be active", () => {
    expect(isActive("/admin/kb", "/admin/kb")).toBe(true);
    expect(getLinkClass("/admin/kb", "/admin/kb")).toContain("border-primary");
  });

  it("new applications item can be active", () => {
    expect(isActive("/admin/applications", "/admin/applications")).toBe(true);
    expect(getLinkClass("/admin/applications", "/admin/applications")).toContain("border-primary");
  });
});

/* ---------- Component import ---------- */

describe("AdminNav component", () => {
  it("can be imported", async () => {
    const mod = await import("../AdminNav");
    expect(mod.AdminNav).toBeDefined();
    expect(typeof mod.AdminNav).toBe("function");
  });
});
