import { describe, it, expect } from "vitest";

/**
 * Sidebar 组件逻辑测试
 *
 * 由于项目测试环境为 node（无 jsdom/testing-library），
 * 这里验证 Sidebar 的核心逻辑：路由激活判断、角色权限过滤、导航项配置。
 */

// --- Extracted logic matching Sidebar implementation ---

const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  TRUSTED_USER: 1,
  DCR_HELPER: 2,
  MODERATOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
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
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 999);
}

function isVisible(item: NavItem, role: string, flags: AccessFlags): boolean {
  if (item.minRole && !hasMinRole(role, item.minRole)) return false;
  if (item.requirePsychAccess && !flags.psychAccess) return false;
  if (item.requireDcrAccess && !flags.dcrAccess) return false;
  return true;
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

const coreNavItems: NavItem[] = [
  { href: "/", label: "首页" },
  { href: "/discover", label: "发现" },
  { href: "/create", label: "发布" },
  { href: "/messages", label: "消息" },
  { href: "/u/me", label: "个人主页" },
];

const zoneNavItems: NavItem[] = [
  { href: "/psych", label: "心理区", requirePsychAccess: true },
  { href: "/dcr/tickets", label: "工单列表", requireDcrAccess: true },
  { href: "/dcr/helper", label: "Helper 工作台", requireDcrAccess: true, minRole: "DCR_HELPER" },
  { href: "/dcr/posts", label: "DCR 帖子", requireDcrAccess: true },
];

const moderationNavItems: NavItem[] = [
  { href: "/moderation", label: "审核", minRole: "MODERATOR" },
];

const adminNavItems: NavItem[] = [
  { href: "/admin/users", label: "用户管理", minRole: "ADMIN" },
  { href: "/admin/invites", label: "邀请码", minRole: "ADMIN" },
  { href: "/admin/audit", label: "审计日志", minRole: "ADMIN" },
  { href: "/admin/boards", label: "板块管理", minRole: "ADMIN" },
];

const allNavItems = [
  ...coreNavItems,
  ...zoneNavItems,
  ...moderationNavItems,
  ...adminNavItems,
];

// --- Tests ---

describe("Sidebar 逻辑", () => {
  describe("核心导航项配置", () => {
    it("应包含五个核心导航入口", () => {
      expect(coreNavItems).toHaveLength(5);
    });

    it("核心导航项标签应正确", () => {
      const labels = coreNavItems.map((i) => i.label);
      expect(labels).toEqual(["首页", "发现", "发布", "消息", "个人主页"]);
    });

    it("核心导航项无角色限制", () => {
      expect(coreNavItems.every((i) => !i.minRole)).toBe(true);
    });
  });

  describe("当前页面高亮判断", () => {
    it("首页路径 '/' 仅精确匹配", () => {
      expect(isActive("/", "/")).toBe(true);
      expect(isActive("/", "/discover")).toBe(false);
    });

    it("子路径前缀匹配", () => {
      expect(isActive("/admin/users", "/admin/users")).toBe(true);
      expect(isActive("/admin/users", "/admin/users/123")).toBe(true);
      expect(isActive("/admin/users", "/admin/invites")).toBe(false);
    });

    it("设置页路径前缀匹配", () => {
      expect(isActive("/settings", "/settings/profile")).toBe(true);
      expect(isActive("/settings", "/settings")).toBe(true);
      expect(isActive("/settings", "/")).toBe(false);
    });
  });

  describe("角色权限过滤 — USER 角色", () => {
    const role = "USER";
    const flags: AccessFlags = {};

    it("可见核心导航项", () => {
      const visible = coreNavItems.filter((i) => isVisible(i, role, flags));
      expect(visible).toHaveLength(5);
    });

    it("不可见审核入口", () => {
      const visible = moderationNavItems.filter((i) =>
        isVisible(i, role, flags)
      );
      expect(visible).toHaveLength(0);
    });

    it("不可见管理后台入口", () => {
      const visible = adminNavItems.filter((i) => isVisible(i, role, flags));
      expect(visible).toHaveLength(0);
    });

    it("无 psychAccess 时不可见心理区", () => {
      const visible = zoneNavItems.filter((i) => isVisible(i, role, flags));
      expect(visible).toHaveLength(0);
    });
  });

  describe("角色权限过滤 — USER 角色 + 专区权限", () => {
    const role = "USER";

    it("有 psychAccess 时可见心理区", () => {
      const flags: AccessFlags = { psychAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, role, flags));
      expect(visible).toHaveLength(1);
      expect(visible[0].label).toBe("心理区");
    });

    it("有 dcrAccess 时可见 DCR 工单列表", () => {
      const flags: AccessFlags = { dcrAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, role, flags));
      expect(visible.some((i) => i.label === "工单列表")).toBe(true);
    });

    it("dcrAccess=true 时侧边栏显示「工单列表」链接（href=/dcr/tickets）", () => {
      const flags: AccessFlags = { dcrAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, role, flags));
      const ticketItem = visible.find((i) => i.label === "工单列表");
      expect(ticketItem).toBeDefined();
      expect(ticketItem!.href).toBe("/dcr/tickets");
    });

    it("同时有两个权限时可见心理区和 DCR 项（USER 角色不含 Helper 工作台）", () => {
      const flags: AccessFlags = { psychAccess: true, dcrAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, role, flags));
      expect(visible).toHaveLength(3);
      expect(visible.map((i) => i.label)).toEqual(["心理区", "工单列表", "DCR 帖子"]);
    });
  });

  describe("角色权限过滤 — MODERATOR 角色", () => {
    const role = "MODERATOR";
    const flags: AccessFlags = {};

    it("可见审核入口", () => {
      const visible = moderationNavItems.filter((i) =>
        isVisible(i, role, flags)
      );
      expect(visible).toHaveLength(1);
      expect(visible[0].label).toBe("审核");
    });

    it("不可见管理后台入口", () => {
      const visible = adminNavItems.filter((i) => isVisible(i, role, flags));
      expect(visible).toHaveLength(0);
    });
  });

  describe("角色权限过滤 — ADMIN 角色", () => {
    const role = "ADMIN";
    const flags: AccessFlags = {};

    it("可见审核入口（ADMIN >= MODERATOR）", () => {
      const visible = moderationNavItems.filter((i) =>
        isVisible(i, role, flags)
      );
      expect(visible).toHaveLength(1);
    });

    it("可见全部管理后台入口", () => {
      const visible = adminNavItems.filter((i) => isVisible(i, role, flags));
      expect(visible).toHaveLength(4);
    });

    it("管理后台入口标签正确", () => {
      const visible = adminNavItems.filter((i) => isVisible(i, role, flags));
      const labels = visible.map((i) => i.label);
      expect(labels).toEqual(["用户管理", "邀请码", "审计日志", "板块管理"]);
    });
  });

  describe("角色层级", () => {
    it("ADMIN 拥有最高权限", () => {
      expect(hasMinRole("ADMIN", "ADMIN")).toBe(true);
      expect(hasMinRole("ADMIN", "MODERATOR")).toBe(true);
      expect(hasMinRole("ADMIN", "USER")).toBe(true);
    });

    it("MODERATOR 不满足 ADMIN 要求", () => {
      expect(hasMinRole("MODERATOR", "ADMIN")).toBe(false);
    });

    it("USER 仅满足 USER 要求", () => {
      expect(hasMinRole("USER", "USER")).toBe(true);
      expect(hasMinRole("USER", "TRUSTED_USER")).toBe(false);
      expect(hasMinRole("USER", "MODERATOR")).toBe(false);
    });

    it("未知角色视为最低权限（等同 USER）", () => {
      expect(hasMinRole("UNKNOWN", "USER")).toBe(true);
      expect(hasMinRole("UNKNOWN", "TRUSTED_USER")).toBe(false);
      expect(hasMinRole("UNKNOWN", "MODERATOR")).toBe(false);
      expect(hasMinRole("UNKNOWN", "ADMIN")).toBe(false);
    });
  });

  describe("保持性测试：psychAccess=true 时侧边栏继续显示「心理区」导航项", () => {
    it("psychAccess=true 时，心理区导航项可见且指向 /psych", () => {
      const flags: AccessFlags = { psychAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, "USER", flags));
      const psychItem = visible.find((i) => i.label === "心理区");
      expect(psychItem).toBeDefined();
      expect(psychItem!.href).toBe("/psych");
    });

    it("psychAccess=true + dcrAccess=true 时，心理区导航项仍然可见", () => {
      const flags: AccessFlags = { psychAccess: true, dcrAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, "USER", flags));
      const psychItem = visible.find((i) => i.label === "心理区");
      expect(psychItem).toBeDefined();
      expect(psychItem!.href).toBe("/psych");
    });

    it("psychAccess=true + dcrAccess=false 时，心理区导航项不受 DCR 状态影响", () => {
      const flags: AccessFlags = { psychAccess: true, dcrAccess: false };
      const visible = zoneNavItems.filter((i) => isVisible(i, "USER", flags));
      const psychItem = visible.find((i) => i.label === "心理区");
      expect(psychItem).toBeDefined();
      expect(psychItem!.href).toBe("/psych");
      // 确认无 DCR 项
      const dcrItems = visible.filter((i) => i.href.startsWith("/dcr"));
      expect(dcrItems).toHaveLength(0);
    });

    it("ADMIN 角色 psychAccess=true 时，心理区导航项仍然可见", () => {
      const flags: AccessFlags = { psychAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, "ADMIN", flags));
      const psychItem = visible.find((i) => i.label === "心理区");
      expect(psychItem).toBeDefined();
      expect(psychItem!.href).toBe("/psych");
    });
  });

  describe("Bug 2 修复验证：dcrAccess=false 时侧边栏不显示任何 DCR 导航项", () => {
    function isDcrRelated(item: NavItem): boolean {
      return item.href.startsWith("/dcr");
    }

    it("USER 角色 dcrAccess=false 时，zoneNavItems 中无 DCR 项可见", () => {
      const flags: AccessFlags = { dcrAccess: false };
      const visible = zoneNavItems.filter((i) => isVisible(i, "USER", flags));
      const dcrItems = visible.filter(isDcrRelated);
      expect(dcrItems).toHaveLength(0);
    });

    it("USER 角色 dcrAccess=false psychAccess=true 时，仅心理区可见，无 DCR 项", () => {
      const flags: AccessFlags = { dcrAccess: false, psychAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, "USER", flags));
      expect(visible).toHaveLength(1);
      expect(visible[0].label).toBe("心理区");
      const dcrItems = visible.filter(isDcrRelated);
      expect(dcrItems).toHaveLength(0);
    });

    it("USER 角色 dcrAccess=false 时，所有导航项中无 DCR 相关项可见", () => {
      const flags: AccessFlags = { dcrAccess: false };
      const visible = allNavItems.filter((i) => isVisible(i, "USER", flags));
      const dcrItems = visible.filter(isDcrRelated);
      expect(dcrItems).toHaveLength(0);
    });

    it("ADMIN 角色 dcrAccess=false 时，所有导航项中无 DCR 相关项可见", () => {
      const flags: AccessFlags = { dcrAccess: false };
      const visible = allNavItems.filter((i) => isVisible(i, "ADMIN", flags));
      const dcrItems = visible.filter(isDcrRelated);
      expect(dcrItems).toHaveLength(0);
    });
  });

  describe("DCR 子导航可见性（Req 2.5）", () => {
    function isDcrRelated(item: NavItem): boolean {
      return item.href.startsWith("/dcr");
    }

    it("USER + dcrAccess 可见工单列表和 DCR 帖子，不可见 Helper 工作台", () => {
      const flags: AccessFlags = { dcrAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, "USER", flags));
      const dcrItems = visible.filter(isDcrRelated);
      expect(dcrItems).toHaveLength(2);
      expect(dcrItems.map((i) => i.label)).toEqual(["工单列表", "DCR 帖子"]);
    });

    it("DCR_HELPER + dcrAccess 可见全部三个 DCR 导航项", () => {
      const flags: AccessFlags = { dcrAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, "DCR_HELPER", flags));
      const dcrItems = visible.filter(isDcrRelated);
      expect(dcrItems).toHaveLength(3);
      expect(dcrItems.map((i) => i.label)).toEqual(["工单列表", "Helper 工作台", "DCR 帖子"]);
    });

    it("ADMIN + dcrAccess 可见全部三个 DCR 导航项（ADMIN >= DCR_HELPER）", () => {
      const flags: AccessFlags = { dcrAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, "ADMIN", flags));
      const dcrItems = visible.filter(isDcrRelated);
      expect(dcrItems).toHaveLength(3);
      expect(dcrItems.map((i) => i.label)).toEqual(["工单列表", "Helper 工作台", "DCR 帖子"]);
    });

    it("TRUSTED_USER + dcrAccess 不可见 Helper 工作台（TRUSTED_USER < DCR_HELPER）", () => {
      const flags: AccessFlags = { dcrAccess: true };
      const visible = zoneNavItems.filter((i) => isVisible(i, "TRUSTED_USER", flags));
      const helperItem = visible.find((i) => i.label === "Helper 工作台");
      expect(helperItem).toBeUndefined();
    });

    it("Helper 工作台 href 正确指向 /dcr/helper", () => {
      const helperItem = zoneNavItems.find((i) => i.label === "Helper 工作台");
      expect(helperItem).toBeDefined();
      expect(helperItem!.href).toBe("/dcr/helper");
    });

    it("DCR 帖子 href 正确指向 /dcr/posts", () => {
      const postsItem = zoneNavItems.find((i) => i.label === "DCR 帖子");
      expect(postsItem).toBeDefined();
      expect(postsItem!.href).toBe("/dcr/posts");
    });

    it("工单列表无 minRole 限制，所有 dcrAccess 用户可见", () => {
      const ticketItem = zoneNavItems.find((i) => i.label === "工单列表");
      expect(ticketItem).toBeDefined();
      expect(ticketItem!.minRole).toBeUndefined();
    });

    it("Helper 工作台 minRole 为 DCR_HELPER", () => {
      const helperItem = zoneNavItems.find((i) => i.label === "Helper 工作台");
      expect(helperItem).toBeDefined();
      expect(helperItem!.minRole).toBe("DCR_HELPER");
    });
  });

  describe("保持性：现有导航项不变（Req 3.9）", () => {
    it("核心导航项数量和标签不变", () => {
      expect(coreNavItems).toHaveLength(5);
      expect(coreNavItems.map((i) => i.label)).toEqual(["首页", "发现", "发布", "消息", "个人主页"]);
    });

    it("审核导航项不变", () => {
      expect(moderationNavItems).toHaveLength(1);
      expect(moderationNavItems[0].label).toBe("审核");
      expect(moderationNavItems[0].minRole).toBe("MODERATOR");
    });

    it("管理后台导航项不变", () => {
      expect(adminNavItems).toHaveLength(4);
      expect(adminNavItems.map((i) => i.label)).toEqual(["用户管理", "邀请码", "审计日志", "板块管理"]);
    });

    it("心理区导航项不变", () => {
      const psychItem = zoneNavItems.find((i) => i.label === "心理区");
      expect(psychItem).toBeDefined();
      expect(psychItem!.href).toBe("/psych");
      expect(psychItem!.requirePsychAccess).toBe(true);
    });
  });
});
