"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Home, Compass, Plus, MessageCircle, User, Shield, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BottomNavProps {
  unreadCount?: number;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  raised?: boolean;
  minRole?: string;
}

const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  TRUSTED_USER: 1,
  DCR_HELPER: 2,
  MODERATOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

function hasMinRole(userRole: string, minRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 999);
}

const navItems: NavItem[] = [
  { href: "/", label: "首页", icon: Home },
  { href: "/discover", label: "发现", icon: Compass },
  { href: "/messages", label: "消息", icon: MessageCircle },
  { href: "/create", label: "发布", icon: Plus, raised: true },
  { href: "/chat", label: "群聊", icon: MessagesSquare },
  { href: "/moderation", label: "管理", icon: Shield, minRole: "MODERATOR" },
  { href: "/u/me", label: "我的", icon: User },
];

export function BottomNav({ unreadCount = 0 }: BottomNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user?.role as string) ?? "USER";

  const visibleItems = navItems.filter(
    (item) => !item.minRole || hasMinRole(role, item.minRole),
  );

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const raisedIdx = visibleItems.findIndex((i) => i.raised);
  const leftItems = raisedIdx >= 0 ? visibleItems.slice(0, raisedIdx) : [];
  const rightItems = raisedIdx >= 0 ? visibleItems.slice(raisedIdx + 1) : visibleItems;
  const raisedItem = raisedIdx >= 0 ? visibleItems[raisedIdx] : null;

  function renderRegular(item: NavItem) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5",
          "min-h-[44px] min-w-[44px] flex-1",
          "transition-colors duration-150",
          active
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span className="relative">
          <Icon className="h-5 w-5" />
          {item.href === "/messages" && unreadCount > 0 && (
            <span
              className={cn(
                "absolute -right-2 -top-1.5 flex items-center justify-center",
                "min-w-[16px] rounded-full bg-destructive px-1 py-0.5",
                "text-[10px] font-medium leading-none text-destructive-foreground"
              )}
              aria-label={`${unreadCount} 条未读消息`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
        <span className="text-[10px] font-medium">{item.label}</span>
      </Link>
    );
  }

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "border-t border-border/40 bg-background/95 backdrop-blur-md",
        "supports-[backdrop-filter]:bg-background/80",
        "lg:hidden"
      )}
      aria-label="底部导航"
    >
      <div className="relative mx-auto flex h-16 max-w-screen-xl items-center px-1">
        {/* Left group */}
        <div className="flex flex-1 items-center justify-around">
          {leftItems.map(renderRegular)}
        </div>

        {/* Raised center button — fixed width to prevent overlap */}
        <div className="relative flex w-[56px] shrink-0 items-end justify-center self-stretch pb-0.5">
          {raisedItem && (() => {
            const active = isActive(raisedItem.href);
            const Icon = raisedItem.icon;
            return (
              <Link
                href={raisedItem.href}
                aria-label={raisedItem.label}
                aria-current={active ? "page" : undefined}
                className="absolute bottom-0 flex flex-col items-center justify-center"
                style={{ transform: "translateY(-8px)" }}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full",
                    "bg-primary text-primary-foreground shadow-lg",
                    "transition-transform duration-150 active:scale-95"
                  )}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <span className="mt-0.5 text-[10px] font-medium text-primary">
                  {raisedItem.label}
                </span>
              </Link>
            );
          })()}
        </div>

        {/* Right group */}
        <div className="flex flex-1 items-center justify-around">
          {rightItems.map(renderRegular)}
        </div>
      </div>
    </nav>
  );
}
