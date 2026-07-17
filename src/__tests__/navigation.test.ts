import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  adminNavItems,
  bottomMoreNavItems,
  bottomPrimaryNavItems,
  isVisible,
  moderationNavItems,
  sidebarCoreNavItems,
  sidebarZoneNavItems,
} from "@/components/layout/navigation-config";

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
  { route: "/chat", description: "群聊入口" },
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

  describe("共享导航配置验证", () => {
    const bottomNavSource = readSourceFile("components/layout/BottomNav.tsx");
    const sidebarSource = readSourceFile("components/layout/Sidebar.tsx");

    it("BottomNav 使用真实共享配置并保持移动端布局", () => {
      expect(bottomNavSource).toContain('from "./navigation-config"');
      expect(bottomNavSource).toContain("lg:hidden");
      expect(bottomPrimaryNavItems.map((item) => item.href)).toEqual([
        "/",
        "/discover",
        "/create",
        "/messages",
      ]);
      expect(bottomMoreNavItems.map((item) => item.href)).toEqual([
        "/u/me",
        "/messages?tab=chat",
        "/dcr",
        "/psych",
        "/moderation",
      ]);
    });

    it("Sidebar 使用真实共享配置并保持桌面布局与设置入口", () => {
      expect(sidebarSource).toContain('from "./navigation-config"');
      expect(sidebarSource).toContain('href="/settings/profile"');
      expect(sidebarSource).toContain("lg:flex");
      expect(sidebarSource).toContain("hidden");
      expect(sidebarCoreNavItems.map((item) => item.href)).toEqual([
        "/",
        "/discover",
        "/messages",
        "/messages?tab=chat",
        "/create",
        "/u/me",
      ]);
    });

    it("普通用户只获得统一 DCR 入口，心理区仍受权限控制", () => {
      const visible = sidebarZoneNavItems.filter((item) =>
        isVisible(item, "USER", { dcrAccess: false }),
      );
      expect(visible.map((item) => item.href)).toEqual(["/dcr"]);
      expect(
        sidebarZoneNavItems.filter((item) =>
          isVisible(item, "USER", { psychAccess: true }),
        ).map((item) => item.href),
      ).toEqual(["/psych", "/dcr"]);
    });

    it("Helper 工作台独立且只对 helper/admin/显式 helper 权限可见", () => {
      const helper = sidebarZoneNavItems.find((item) => item.href === "/dcr/helper");
      expect(helper).toBeDefined();
      expect(isVisible(helper!, "USER", {})).toBe(false);
      expect(isVisible(helper!, "DCR_HELPER", {})).toBe(true);
      expect(isVisible(helper!, "ADMIN", {})).toBe(true);
      expect(isVisible(helper!, "USER", { dcrHelperAccess: true })).toBe(true);
    });

    it("审核与管理端入口配置保持不变", () => {
      expect(moderationNavItems).toEqual([
        expect.objectContaining({ href: "/moderation", minRole: "MODERATOR" }),
      ]);
      expect(adminNavItems.map((item) => item.href)).toEqual([
        "/admin/users",
        "/admin/content",
        "/admin/invites",
        "/admin/audit",
        "/admin/boards",
        "/admin/kb",
        "/admin/applications",
        "/admin/dcr/reviews",
        "/admin/dcr/questions",
        "/admin/quiz",
        "/admin/chat-rooms",
        "/admin/disputes",
        "/admin/tasks",
        "/admin/logs",
        "/admin/telemetry",
        "/admin/system",
        "/admin/dcr/tutorial",
        "/admin/site-content",
      ]);
    });
  });

  describe("页面组件可导入性验证", () => {
    it("首页 Feed 组件可正常导入", { timeout: 15000 }, async () => {
      const mod = await import("../app/page");
      expect(mod.default).toBeDefined();
    });

    it("搜索页组件可正常导入", { timeout: 15000 }, async () => {
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
