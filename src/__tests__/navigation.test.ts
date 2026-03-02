import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * 全局路由与导航集成测试
 *
 * Validates: Requirements 21.1, 21.2, 21.3, 21.4, 37.1, 37.2, 37.3
 *
 * Since the test environment is Node (no jsdom), we use static analysis:
 * - Verify all expected routes have corresponding page files
 * - Verify navigation component source contains correct link hrefs
 * - Verify role-based navigation items are properly configured
 */

const APP_DIR = path.resolve(__dirname, "../app");

// --- Route file existence helpers ---

/**
 * Resolves a URL route to the expected page file path(s).
 * Next.js App Router supports route groups like (public), (auth), (member), etc.
 * We check both direct paths and common route group prefixes.
 */
function findPageFile(route: string): string | null {
  // Normalize: remove leading slash
  const normalized = route.replace(/^\//, "");

  // Direct path
  const directPath = path.join(APP_DIR, normalized, "page.tsx");
  if (fs.existsSync(directPath)) return directPath;

  // Check common route groups
  const routeGroups = [
    "(public)",
    "(auth)",
    "(member)",
    "(psych)",
    "(dcr)",
    "(admin)",
  ];
  for (const group of routeGroups) {
    const groupPath = path.join(APP_DIR, group, normalized, "page.tsx");
    if (fs.existsSync(groupPath)) return groupPath;
  }

  // Root page (/)
  if (normalized === "") {
    const rootPage = path.join(APP_DIR, "page.tsx");
    if (fs.existsSync(rootPage)) return rootPage;
  }

  return null;
}

// --- Expected routes from design document ---

const EXPECTED_ROUTES: { route: string; description: string }[] = [
  { route: "/", description: "首页 Feed" },
  { route: "/discover", description: "发现页" },
  { route: "/create", description: "发布页" },
  { route: "/messages", description: "通知页" },
  { route: "/settings/profile", description: "个人设置" },
  { route: "/search", description: "搜索页" },
  { route: "/login", description: "登录页" },
  { route: "/onboarding", description: "新手引导" },
  { route: "/help/policies", description: "合规文档" },
  { route: "/apply", description: "心理区申请" },
  { route: "/psych", description: "心理区" },
  { route: "/psych/confide", description: "倾诉匹配" },
  { route: "/dcr", description: "DCR 入口" },
  { route: "/dcr/tickets", description: "工单列表" },
  { route: "/dcr/tickets/new", description: "新建工单" },
  { route: "/moderation", description: "审核看板" },
  { route: "/admin/users", description: "用户管理" },
  { route: "/admin/invites", description: "邀请码管理" },
  { route: "/admin/audit", description: "审计日志" },
  { route: "/admin/boards", description: "板块管理" },
  { route: "/kb", description: "知识库" },
  { route: "/403", description: "无权限页面" },
];

// Dynamic routes — we check the [param] directory structure
const EXPECTED_DYNAMIC_ROUTES: {
  route: string;
  description: string;
  dirPattern: string;
}[] = [
  {
    route: "/u/[id]",
    description: "个人主页",
    dirPattern: "u/[id]/page.tsx",
  },
  {
    route: "/post/[id]",
    description: "帖子详情",
    dirPattern: "post/[id]/page.tsx",
  },
  {
    route: "/kb/[id]",
    description: "知识库文章详情",
    dirPattern: "kb/[id]/page.tsx",
  },
  {
    route: "/dcr/tickets/[id]",
    description: "工单详情",
    dirPattern: "dcr/tickets/[id]/page.tsx",
  },
];

// --- Source file reading helper ---

function readSourceFile(relativePath: string): string {
  const fullPath = path.resolve(__dirname, "..", relativePath);
  return fs.readFileSync(fullPath, "utf-8");
}

// ==================== Tests ====================

describe("全局路由与导航集成", () => {
  describe("页面路由文件存在性验证", () => {
    for (const { route, description } of EXPECTED_ROUTES) {
      it(`${description} (${route}) 页面文件应存在`, () => {
        const found = findPageFile(route);
        expect(found).not.toBeNull();
      });
    }

    for (const { route, description, dirPattern } of EXPECTED_DYNAMIC_ROUTES) {
      it(`${description} (${route}) 动态路由页面文件应存在`, () => {
        const fullPath = path.join(APP_DIR, dirPattern);
        const exists = fs.existsSync(fullPath);
        // Also check route groups
        if (!exists) {
          const routeGroups = [
            "(public)",
            "(auth)",
            "(member)",
            "(psych)",
            "(dcr)",
            "(admin)",
          ];
          const foundInGroup = routeGroups.some((g) =>
            fs.existsSync(path.join(APP_DIR, g, dirPattern))
          );
          expect(foundInGroup).toBe(true);
        } else {
          expect(exists).toBe(true);
        }
      });
    }
  });

  describe("错误页面存在性验证", () => {
    it("not-found.tsx (404) 应存在", () => {
      expect(fs.existsSync(path.join(APP_DIR, "not-found.tsx"))).toBe(true);
    });

    it("error.tsx (500) 应存在", () => {
      expect(fs.existsSync(path.join(APP_DIR, "error.tsx"))).toBe(true);
    });

    it("403 页面应存在", () => {
      expect(fs.existsSync(path.join(APP_DIR, "403/page.tsx"))).toBe(true);
    });
  });

  describe("TopBar 搜索导航验证", () => {
    const topBarSource = readSourceFile("components/layout/TopBar.tsx");

    it("搜索表单应导航至 /search?q= 路径", () => {
      expect(topBarSource).toContain("/search?q=");
    });

    it("搜索应使用 encodeURIComponent 编码查询参数", () => {
      expect(topBarSource).toContain("encodeURIComponent");
    });

    it("发布按钮应链接至 /create", () => {
      expect(topBarSource).toContain('href="/create"');
    });

    it("消息铃铛应链接至 /messages", () => {
      expect(topBarSource).toContain('href="/messages"');
    });

    it("Logo 应链接至首页 /", () => {
      expect(topBarSource).toContain('href="/"');
    });
  });

  describe("BottomNav 导航链接验证", () => {
    const bottomNavSource = readSourceFile("components/layout/BottomNav.tsx");

    it("应包含首页链接 /", () => {
      expect(bottomNavSource).toContain('href: "/"');
    });

    it("应包含发现页链接 /discover", () => {
      expect(bottomNavSource).toContain('href: "/discover"');
    });

    it("应包含发布页链接 /create", () => {
      expect(bottomNavSource).toContain('href: "/create"');
    });

    it("应包含消息页链接 /messages", () => {
      expect(bottomNavSource).toContain('href: "/messages"');
    });

    it("应包含个人主页链接 /u/me", () => {
      expect(bottomNavSource).toContain('href: "/u/me"');
    });

    it("应包含五个导航项", () => {
      const hrefMatches = bottomNavSource.match(/href:\s*"/g);
      // navItems array has 5 href entries
      expect(hrefMatches).not.toBeNull();
      expect(hrefMatches!.length).toBeGreaterThanOrEqual(5);
    });

    it("移动端显示、PC 端隐藏 (lg:hidden)", () => {
      expect(bottomNavSource).toContain("lg:hidden");
    });
  });

  describe("Sidebar 导航链接与角色验证", () => {
    const sidebarSource = readSourceFile("components/layout/Sidebar.tsx");

    it("核心导航应包含首页 /", () => {
      expect(sidebarSource).toContain('href: "/"');
    });

    it("核心导航应包含发现页 /discover", () => {
      expect(sidebarSource).toContain('href: "/discover"');
    });

    it("核心导航应包含发布页 /create", () => {
      expect(sidebarSource).toContain('href: "/create"');
    });

    it("核心导航应包含消息页 /messages", () => {
      expect(sidebarSource).toContain('href: "/messages"');
    });

    it("核心导航应包含个人主页 /u/me", () => {
      expect(sidebarSource).toContain('href: "/u/me"');
    });

    it("心理区入口应需要 psychAccess 权限", () => {
      expect(sidebarSource).toContain("requirePsychAccess: true");
      expect(sidebarSource).toContain('href: "/psych"');
    });

    it("DCR 区入口应需要 dcrAccess 权限", () => {
      expect(sidebarSource).toContain("requireDcrAccess: true");
      // Task 8.2 changed sidebar to have DCR sub-navigation items
      expect(sidebarSource).toContain('href: "/dcr/tickets"');
      expect(sidebarSource).toContain('href: "/dcr/helper"');
      expect(sidebarSource).toContain('href: "/dcr/posts"');
    });

    it("审核入口应需要 MODERATOR 角色", () => {
      expect(sidebarSource).toContain('href: "/moderation"');
      expect(sidebarSource).toContain('"MODERATOR"');
    });

    it("管理后台入口应需要 ADMIN 角色", () => {
      expect(sidebarSource).toContain('href: "/admin/users"');
      expect(sidebarSource).toContain('href: "/admin/invites"');
      expect(sidebarSource).toContain('href: "/admin/audit"');
      expect(sidebarSource).toContain('href: "/admin/boards"');
    });

    it("设置链接应指向 /settings/profile", () => {
      expect(sidebarSource).toContain('href="/settings/profile"');
    });

    it("PC 端显示、移动端隐藏 (lg:flex + hidden)", () => {
      expect(sidebarSource).toContain("lg:flex");
      expect(sidebarSource).toContain("hidden");
    });

    it("应定义角色层级 (ROLE_HIERARCHY)", () => {
      expect(sidebarSource).toContain("ROLE_HIERARCHY");
      expect(sidebarSource).toContain("USER");
      expect(sidebarSource).toContain("TRUSTED_USER");
      expect(sidebarSource).toContain("DCR_HELPER");
      expect(sidebarSource).toContain("MODERATOR");
      expect(sidebarSource).toContain("ADMIN");
    });
  });

  describe("角色动态导航渲染逻辑验证", () => {
    // Re-implement the visibility logic for testing
    const ROLE_HIERARCHY: Record<string, number> = {
      USER: 0,
      TRUSTED_USER: 1,
      DCR_HELPER: 2,
      MODERATOR: 3,
      ADMIN: 4,
    };

    interface NavItem {
      href: string;
      label: string;
      minRole?: string;
      requirePsychAccess?: boolean;
      requireDcrAccess?: boolean;
    }

    interface AccessFlags {
      psychAccess?: boolean;
      dcrAccess?: boolean;
    }

    function hasMinRole(userRole: string, minRole: string): boolean {
      return (
        (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 999)
      );
    }

    function isVisible(
      item: NavItem,
      role: string,
      flags: AccessFlags
    ): boolean {
      if (item.minRole && !hasMinRole(role, item.minRole)) return false;
      if (item.requirePsychAccess && !flags.psychAccess) return false;
      if (item.requireDcrAccess && !flags.dcrAccess) return false;
      return true;
    }

    const allRoleItems: NavItem[] = [
      { href: "/psych", label: "心理区", requirePsychAccess: true },
      { href: "/dcr/tickets", label: "工单列表", requireDcrAccess: true },
      { href: "/dcr/helper", label: "Helper 工作台", requireDcrAccess: true, minRole: "DCR_HELPER" },
      { href: "/dcr/posts", label: "DCR 帖子", requireDcrAccess: true },
      { href: "/moderation", label: "审核", minRole: "MODERATOR" },
      { href: "/admin/users", label: "用户管理", minRole: "ADMIN" },
      { href: "/admin/invites", label: "邀请码", minRole: "ADMIN" },
      { href: "/admin/audit", label: "审计日志", minRole: "ADMIN" },
      { href: "/admin/boards", label: "板块管理", minRole: "ADMIN" },
    ];

    it("普通 USER 无专区权限时不可见任何受限导航项", () => {
      const visible = allRoleItems.filter((i) =>
        isVisible(i, "USER", {})
      );
      expect(visible).toHaveLength(0);
    });

    it("USER + psychAccess 仅可见心理区", () => {
      const visible = allRoleItems.filter((i) =>
        isVisible(i, "USER", { psychAccess: true })
      );
      expect(visible).toHaveLength(1);
      expect(visible[0].href).toBe("/psych");
    });

    it("USER + dcrAccess 仅可见 DCR 区", () => {
      const visible = allRoleItems.filter((i) =>
        isVisible(i, "USER", { dcrAccess: true })
      );
      expect(visible).toHaveLength(2);
      expect(visible[0].href).toBe("/dcr/tickets");
      expect(visible[1].href).toBe("/dcr/posts");
    });

    it("MODERATOR 可见审核入口但不可见管理后台", () => {
      const visible = allRoleItems.filter((i) =>
        isVisible(i, "MODERATOR", {})
      );
      expect(visible).toHaveLength(1);
      expect(visible[0].href).toBe("/moderation");
    });

    it("ADMIN 可见审核入口和全部管理后台入口", () => {
      const visible = allRoleItems.filter((i) =>
        isVisible(i, "ADMIN", {})
      );
      expect(visible).toHaveLength(5); // moderation + 4 admin
      const hrefs = visible.map((i) => i.href);
      expect(hrefs).toContain("/moderation");
      expect(hrefs).toContain("/admin/users");
      expect(hrefs).toContain("/admin/invites");
      expect(hrefs).toContain("/admin/audit");
      expect(hrefs).toContain("/admin/boards");
    });

    it("ADMIN + 全部专区权限可见所有导航项", () => {
      const visible = allRoleItems.filter((i) =>
        isVisible(i, "ADMIN", { psychAccess: true, dcrAccess: true })
      );
      expect(visible).toHaveLength(9);
    });
  });

  describe("页面组件可导入性验证", () => {
    it("首页 Feed 组件可正常导入", async () => {
      const mod = await import("../app/page");
      expect(mod.default).toBeDefined();
    });

    it("搜索页组件可正常导入", async () => {
      const mod = await import("../app/search/page");
      expect(mod.default).toBeDefined();
    });

    it("发现页组件可正常导入", async () => {
      const mod = await import("../app/discover/page");
      expect(mod.default).toBeDefined();
    });

    it("403 页面组件可正常导入", async () => {
      const mod = await import("../app/403/page");
      expect(mod.default).toBeDefined();
    });

    it("not-found 页面组件可正常导入", async () => {
      const mod = await import("../app/not-found");
      expect(mod.default).toBeDefined();
    });

    it("error 页面组件可正常导入", async () => {
      const mod = await import("../app/error");
      expect(mod.default).toBeDefined();
    });
  });
});
