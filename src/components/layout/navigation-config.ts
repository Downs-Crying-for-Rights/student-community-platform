export const ROLE_HIERARCHY: Readonly<Record<string, number>> = {
  USER: 0,
  TRUSTED_USER: 1,
  DCR_HELPER: 2,
  MODERATOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

export interface NavigationAccessFlags {
  psychAccess?: boolean;
  dcrAccess?: boolean;
  dcrHelperAccess?: boolean;
}

export type NavigationIconName =
  | "home"
  | "compass"
  | "plus"
  | "message"
  | "user"
  | "shield"
  | "shield-check"
  | "users"
  | "ticket"
  | "file-text"
  | "dashboard"
  | "heart"
  | "settings"
  | "terminal"
  | "messages"
  | "book"
  | "clipboard-check"
  | "activity"
  | "refresh"
  | "list-todo"
  | "scale";

export interface NavigationItem {
  href: string;
  label: string;
  icon: NavigationIconName;
  minRole?: string;
  requirePsychAccess?: boolean;
  requireDcrAccess?: boolean;
  requireHelperAccess?: boolean;
}

export interface BottomPrimaryNavigationItem extends NavigationItem {
  slot: "leading" | "center" | "trailing";
  raised?: boolean;
  badge?: "unread";
}

/** Core sidebar items visible to every authenticated user. */
export const sidebarCoreNavItems: readonly NavigationItem[] = [
  { href: "/", label: "首页", icon: "home" },
  { href: "/discover", label: "发现", icon: "compass" },
  { href: "/messages", label: "消息", icon: "message" },
  { href: "/messages?tab=chat", label: "群聊", icon: "messages" },
  { href: "/create", label: "发布", icon: "plus" },
  { href: "/u/me", label: "个人主页", icon: "user" },
];

/** Product zones. DCR remains visible before admission; its children live inside /dcr. */
export const sidebarZoneNavItems: readonly NavigationItem[] = [
  { href: "/psych", label: "心理区", icon: "heart", requirePsychAccess: true },
  { href: "/dcr", label: "DCR 互助", icon: "shield-check" },
  { href: "/dcr/helper", label: "Helper 工作台", icon: "shield-check", requireHelperAccess: true },
];

export const moderationNavItems: readonly NavigationItem[] = [
  { href: "/moderation", label: "审核", icon: "shield", minRole: "MODERATOR" },
];

/** Admin destinations intentionally remain unchanged. */
export const adminNavItems: readonly NavigationItem[] = [
  { href: "/admin/users", label: "用户管理", icon: "users", minRole: "ADMIN" },
  { href: "/admin/content", label: "内容管理", icon: "file-text", minRole: "ADMIN" },
  { href: "/admin/invites", label: "邀请码", icon: "ticket", minRole: "ADMIN" },
  { href: "/admin/audit", label: "操作日志", icon: "file-text", minRole: "ADMIN" },
  { href: "/admin/boards", label: "板块管理", icon: "dashboard", minRole: "ADMIN" },
  { href: "/admin/kb", label: "知识库", icon: "book", minRole: "ADMIN" },
  { href: "/admin/applications", label: "准入审核", icon: "shield-check", minRole: "ADMIN" },
  { href: "/admin/dcr/reviews", label: "委托表审核", icon: "clipboard-check", minRole: "ADMIN" },
  { href: "/admin/dcr/questions", label: "DCR 入频考核题库", icon: "book", minRole: "ADMIN" },
  { href: "/admin/quiz", label: "平台新手指引题库", icon: "book", minRole: "ADMIN" },
  { href: "/admin/chat-rooms", label: "群聊审核", icon: "messages", minRole: "ADMIN" },
  { href: "/admin/disputes", label: "争议处理", icon: "scale", minRole: "ADMIN" },
  { href: "/admin/tasks", label: "任务管理", icon: "list-todo", minRole: "ADMIN" },
  { href: "/admin/dcr/cycles", label: "互助循环管理", icon: "refresh", minRole: "ADMIN" },
  { href: "/admin/logs", label: "系统日志", icon: "terminal", minRole: "ADMIN" },
  { href: "/admin/telemetry", label: "应用遥测", icon: "activity", minRole: "SUPER_ADMIN" },
  { href: "/admin/system", label: "系统维护", icon: "refresh", minRole: "SUPER_ADMIN" },
  { href: "/admin/dcr/tutorial", label: "DCR 教程", icon: "book", minRole: "SUPER_ADMIN" },
  { href: "/admin/site-content", label: "站点内容", icon: "file-text", minRole: "SUPER_ADMIN" },
];

export const bottomPrimaryNavItems: readonly BottomPrimaryNavigationItem[] = [
  { href: "/", label: "首页", icon: "home", slot: "leading" },
  { href: "/discover", label: "发现", icon: "compass", slot: "leading" },
  { href: "/create", label: "发布", icon: "plus", slot: "center", raised: true },
  { href: "/messages", label: "消息", icon: "message", slot: "trailing", badge: "unread" },
];

/** Items shown in the mobile "更多" sheet. */
export const bottomMoreNavItems: readonly NavigationItem[] = [
  { href: "/u/me", label: "我的", icon: "user" },
  { href: "/messages?tab=chat", label: "群聊", icon: "messages" },
  { href: "/dcr", label: "DCR 互助", icon: "shield-check" },
  { href: "/psych", label: "心理区", icon: "heart", requirePsychAccess: true },
  { href: "/moderation", label: "审核", icon: "shield", minRole: "MODERATOR" },
];

export function hasMinRole(userRole: string, minRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? ROLE_HIERARCHY.USER) >=
    (ROLE_HIERARCHY[minRole] ?? Number.POSITIVE_INFINITY);
}

export function isVisible(
  item: NavigationItem,
  role: string,
  flags: NavigationAccessFlags = {},
): boolean {
  if (item.minRole && !hasMinRole(role, item.minRole)) return false;
  if (item.requirePsychAccess && !flags.psychAccess) return false;
  if (item.requireDcrAccess && !flags.dcrAccess) return false;
  if (
    item.requireHelperAccess &&
    role !== "DCR_HELPER" &&
    !hasMinRole(role, "ADMIN") &&
    !flags.dcrHelperAccess
  ) {
    return false;
  }
  return true;
}

export function isActive(href: string, pathname: string): boolean {
  if (href === "/messages?tab=chat") return pathname === "/chat" || pathname.startsWith("/chat/");

  const path = href.split("?", 1)[0];
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function formatUnreadCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

export function getUnreadAccessibleLabel(count: number): string | null {
  if (count <= 0) return null;
  return `${count} 条未读消息`;
}
