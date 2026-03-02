"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Home,
  Compass,
  PlusCircle,
  MessageCircle,
  User,
  Shield,
  ShieldCheck,
  Users,
  Ticket,
  FileText,
  LayoutDashboard,
  Heart,
  Lock,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/** Flags for special zone access, fetched from user profile */
export interface SidebarAccessFlags {
  psychAccess?: boolean;
  dcrAccess?: boolean;
}

export interface SidebarProps {
  /** Optional access flags — when omitted, psych/dcr items are hidden */
  accessFlags?: SidebarAccessFlags;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Minimum role required to see this item (inclusive of higher roles) */
  minRole?: string;
  /** Show only when user has psychAccess */
  requirePsychAccess?: boolean;
  /** Show only when user has dcrAccess */
  requireDcrAccess?: boolean;
}

const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  TRUSTED_USER: 1,
  DCR_HELPER: 2,
  MODERATOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

/** Core nav items visible to all authenticated users */
const coreNavItems: NavItem[] = [
  { href: "/", label: "首页", icon: Home },
  { href: "/discover", label: "发现", icon: Compass },
  { href: "/create", label: "发布", icon: PlusCircle },
  { href: "/messages", label: "消息", icon: MessageCircle },
  { href: "/u/me", label: "个人主页", icon: User },
];

/** Zone-specific nav items */
const zoneNavItems: NavItem[] = [
  { href: "/psych", label: "心理区", icon: Heart, requirePsychAccess: true },
  { href: "/dcr/tickets", label: "工单列表", icon: Lock, requireDcrAccess: true },
  { href: "/dcr/helper", label: "Helper 工作台", icon: ShieldCheck, requireDcrAccess: true, minRole: "DCR_HELPER" },
  { href: "/dcr/posts", label: "DCR 帖子", icon: FileText, requireDcrAccess: true },
];

/** Moderation nav items */
const moderationNavItems: NavItem[] = [
  { href: "/moderation", label: "审核", icon: Shield, minRole: "MODERATOR" },
];

/** Admin nav items */
const adminNavItems: NavItem[] = [
  { href: "/admin/users", label: "用户管理", icon: Users, minRole: "ADMIN" },
  { href: "/admin/invites", label: "邀请码", icon: Ticket, minRole: "ADMIN" },
  { href: "/admin/audit", label: "审计日志", icon: FileText, minRole: "ADMIN" },
  {
    href: "/admin/boards",
    label: "板块管理",
    icon: LayoutDashboard,
    minRole: "ADMIN",
  },
];

function hasMinRole(userRole: string, minRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 999);
}

function isVisible(
  item: NavItem,
  role: string,
  flags: SidebarAccessFlags
): boolean {
  if (item.minRole && !hasMinRole(role, item.minRole)) return false;
  if (item.requirePsychAccess && !flags.psychAccess) return false;
  if (item.requireDcrAccess && !flags.dcrAccess) return false;
  return true;
}

export function Sidebar({ accessFlags: propAccessFlags }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [fetchedFlags, setFetchedFlags] = useState<SidebarAccessFlags>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-fetch access flags from user profile API
  useEffect(() => {
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return;

    let cancelled = false;
    fetch(`/api/users/${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) {
          setFetchedFlags({
            psychAccess: data.user.psychAccess ?? false,
            dcrAccess: data.user.dcrAccess ?? false,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session]);

  // Props override fetched flags (for backward compat)
  const accessFlags: SidebarAccessFlags = {
    psychAccess: propAccessFlags?.psychAccess ?? fetchedFlags.psychAccess,
    dcrAccess: propAccessFlags?.dcrAccess ?? fetchedFlags.dcrAccess,
  };

  const role = (session?.user?.role as string) ?? "USER";

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function renderNavItem(item: NavItem) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          "min-h-[44px]",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span>{item.label}</span>
      </Link>
    );
  }

  const visibleZoneItems = zoneNavItems.filter((i) =>
    isVisible(i, role, accessFlags)
  );
  const visibleModItems = moderationNavItems.filter((i) =>
    isVisible(i, role, accessFlags)
  );
  const visibleAdminItems = adminNavItems.filter((i) =>
    isVisible(i, role, accessFlags)
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/40 bg-background",
        "lg:flex"
      )}
      aria-label="侧边栏导航"
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border/40 px-6">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-foreground"
          aria-label="学互会首页"
        >
          学互会
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {/* Core items */}
        <div className="flex flex-col gap-0.5">
          {coreNavItems.map(renderNavItem)}
        </div>

        {/* Zone items */}
        {visibleZoneItems.length > 0 && (
          <>
            <div className="my-3 border-t border-border/40" />
            <span className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              专区
            </span>
            <div className="flex flex-col gap-0.5">
              {visibleZoneItems.map(renderNavItem)}
            </div>
          </>
        )}

        {/* Moderation items */}
        {visibleModItems.length > 0 && (
          <>
            <div className="my-3 border-t border-border/40" />
            <span className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              管理
            </span>
            <div className="flex flex-col gap-0.5">
              {visibleModItems.map(renderNavItem)}
            </div>
          </>
        )}

        {/* Admin items */}
        {visibleAdminItems.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {visibleAdminItems.map(renderNavItem)}
          </div>
        )}
      </nav>

      {/* Bottom section: settings + theme toggle */}
      <div className="border-t border-border/40 px-3 py-3">
        <Link
          href="/settings/profile"
          aria-label="设置"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            "min-h-[44px]",
            isActive("/settings")
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span>设置</span>
        </Link>

        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={mounted && theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            "min-h-[44px]",
            "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {mounted && theme === "dark" ? (
            <Sun className="h-5 w-5 shrink-0" />
          ) : (
            <Moon className="h-5 w-5 shrink-0" />
          )}
          <span>{mounted && theme === "dark" ? "浅色模式" : "深色模式"}</span>
        </button>
      </div>
    </aside>
  );
}
