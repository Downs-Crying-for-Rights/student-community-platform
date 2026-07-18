"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- full document navigation prevents stale App Router trees across deployments */

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
  Settings,
  Terminal,
  Sun,
  Moon,
  MessagesSquare,
  BookOpen,
  ClipboardCheck,
  Activity,
  RefreshCw,
  ListTodo,
  Scale,
  Flag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  adminNavItems,
  isActive,
  isVisible,
  moderationNavItems,
  sidebarCoreNavItems,
  sidebarZoneNavItems,
  type NavigationAccessFlags,
  type NavigationIconName,
  type NavigationItem,
} from "./navigation-config";

export type SidebarAccessFlags = NavigationAccessFlags;

export interface SidebarProps {
  /** Optional access flags; props override values fetched from the user profile. */
  accessFlags?: SidebarAccessFlags;
}

const NAV_ICONS: Record<NavigationIconName, LucideIcon> = {
  home: Home,
  compass: Compass,
  plus: PlusCircle,
  message: MessageCircle,
  user: User,
  shield: Shield,
  "shield-check": ShieldCheck,
  users: Users,
  ticket: Ticket,
  "file-text": FileText,
  dashboard: LayoutDashboard,
  heart: Heart,
  settings: Settings,
  terminal: Terminal,
  messages: MessagesSquare,
  book: BookOpen,
  "clipboard-check": ClipboardCheck,
  activity: Activity,
  refresh: RefreshCw,
  "list-todo": ListTodo,
  scale: Scale,
  flag: Flag,
};

export function Sidebar({ accessFlags: propAccessFlags }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [fetchedFlags, setFetchedFlags] = useState<SidebarAccessFlags>({});
  const [flagsLoading, setFlagsLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return;

    let cancelled = false;
    setFlagsLoading(true);
    fetch(`/api/users/${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) {
          setFetchedFlags({
            psychAccess: data.user.psychAccess ?? false,
            dcrAccess: data.user.dcrAccess ?? false,
            dcrHelperAccess: data.user.dcrHelperAccess ?? false,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFlagsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const accessFlags: SidebarAccessFlags = {
    psychAccess: propAccessFlags?.psychAccess ?? fetchedFlags.psychAccess,
    dcrAccess: propAccessFlags?.dcrAccess ?? fetchedFlags.dcrAccess,
    dcrHelperAccess: propAccessFlags?.dcrHelperAccess ?? fetchedFlags.dcrHelperAccess,
  };
  const role = (session?.user?.role as string) ?? "USER";

  function renderNavItem(item: NavigationItem) {
    const active = isActive(item.href, pathname);
    const Icon = NAV_ICONS[item.icon];
    return (
      <a
        key={item.href}
        href={item.href}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          "min-h-[44px]",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span>{item.label}</span>
      </a>
    );
  }

  const visibleZoneItems = sidebarZoneNavItems.filter((item) =>
    isVisible(item, role, accessFlags),
  );
  const visibleModItems = moderationNavItems.filter((item) =>
    isVisible(item, role, accessFlags),
  );
  const visibleAdminItems = adminNavItems.filter((item) =>
    isVisible(item, role, accessFlags),
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/40 bg-background",
        "lg:flex",
      )}
      aria-label="侧边栏导航"
    >
      <div className="flex h-14 items-center border-b border-border/40 px-6">
        <a
          href="/"
          className="text-lg font-bold tracking-tight text-foreground"
          aria-label="学互会首页"
        >
          学互会
        </a>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-0.5">
          {sidebarCoreNavItems.map(renderNavItem)}
        </div>

        {flagsLoading && propAccessFlags == null ? (
          <div className="mt-2 space-y-1.5 px-2" aria-label="专区加载中">
            <div className="h-3 w-10 animate-pulse rounded bg-muted" />
            <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-9 w-3/4 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : visibleZoneItems.length > 0 ? (
          <>
            <div className="my-3 border-t border-border/40" />
            <span className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              专区
            </span>
            <div className="flex flex-col gap-0.5">
              {visibleZoneItems.map(renderNavItem)}
            </div>
          </>
        ) : null}

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

        {visibleAdminItems.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {visibleAdminItems.map(renderNavItem)}
          </div>
        )}
      </nav>

      <div className="border-t border-border/40 px-3 py-3">
        <a
          href="/settings/profile"
          aria-label="设置"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            "min-h-[44px]",
            isActive("/settings", pathname)
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span>设置</span>
        </a>

        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={mounted && theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            "min-h-[44px]",
            "text-muted-foreground hover:bg-accent hover:text-foreground",
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
