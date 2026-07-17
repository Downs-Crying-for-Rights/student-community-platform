"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Home,
  Compass,
  Plus,
  MessageCircle,
  Ellipsis,
  User,
  MessagesSquare,
  Shield,
  ShieldCheck,
  Heart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  bottomMoreNavItems,
  bottomPrimaryNavItems,
  formatUnreadCount,
  getUnreadAccessibleLabel,
  isActive,
  isVisible,
  type BottomPrimaryNavigationItem,
  type NavigationIconName,
  type NavigationItem,
} from "./navigation-config";

export interface BottomNavProps {
  unreadCount?: number;
}

const NAV_ICONS: Partial<Record<NavigationIconName, LucideIcon>> = {
  home: Home,
  compass: Compass,
  plus: Plus,
  message: MessageCircle,
  user: User,
  messages: MessagesSquare,
  shield: Shield,
  "shield-check": ShieldCheck,
  heart: Heart,
};

function getIcon(item: NavigationItem): LucideIcon {
  const Icon = NAV_ICONS[item.icon];
  if (!Icon) throw new Error(`BottomNav icon is not configured: ${item.icon}`);
  return Icon;
}

export function BottomNav({ unreadCount = 0 }: BottomNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user?.role as string) ?? "USER";
  const [psychAccess, setPsychAccess] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return;

    let cancelled = false;
    fetch(`/api/users/${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) {
          setPsychAccess(data.user.psychAccess ?? false);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [session]);

  const visibleMoreItems = bottomMoreNavItems.filter((item) =>
    isVisible(item, role, { psychAccess }),
  );
  const moreActive = visibleMoreItems.some((item) =>
    isActive(item.href, pathname),
  );

  function NavLink({ item }: { item: BottomPrimaryNavigationItem }) {
    const active = isActive(item.href, pathname);
    const Icon = getIcon(item);
    const badgeText = item.badge === "unread" ? formatUnreadCount(unreadCount) : null;
    const badgeLabel = item.badge === "unread" ? getUnreadAccessibleLabel(unreadCount) : null;

    return (
      <a
        href={item.href}
        aria-label={badgeLabel ? `${item.label}，${badgeLabel}` : item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5",
          "min-h-[44px] min-w-[44px] flex-1",
          "transition-colors duration-150",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="relative">
          <Icon className="h-5 w-5" />
          {badgeText && (
            <span className="absolute -right-2 -top-1.5 flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
              <span aria-hidden="true">{badgeText}</span>
              <span className="sr-only">{badgeLabel}</span>
            </span>
          )}
        </span>
        <span className="text-[10px] font-medium">{item.label}</span>
      </a>
    );
  }

  const leadingItems = bottomPrimaryNavItems.filter((item) => item.slot === "leading");
  const centerItem = bottomPrimaryNavItems.find((item) => item.slot === "center");
  const trailingItems = bottomPrimaryNavItems.filter((item) => item.slot === "trailing");

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "border-t border-border/40 bg-background/95 backdrop-blur-md",
        "supports-[backdrop-filter]:bg-background/80",
        "lg:hidden",
      )}
      aria-label="底部导航"
    >
      <div className="relative mx-auto flex h-16 max-w-screen-xl items-center px-1">
        <div className="flex flex-1 items-center justify-around">
          {leadingItems.map((item) => <NavLink key={item.href} item={item} />)}
        </div>

        {centerItem && (
          <div className="relative flex w-[56px] shrink-0 items-end justify-center self-stretch pb-0.5">
            <a
              href={centerItem.href}
              aria-label={centerItem.label}
              aria-current={isActive(centerItem.href, pathname) ? "page" : undefined}
              className="absolute bottom-0 flex flex-col items-center justify-center"
              style={{ transform: "translateY(-8px)" }}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 active:scale-95">
                {(() => {
                  const Icon = getIcon(centerItem);
                  return <Icon className="h-6 w-6" />;
                })()}
              </span>
              <span className="mt-0.5 text-[10px] font-medium text-primary">
                {centerItem.label}
              </span>
            </a>
          </div>
        )}

        <div className="flex flex-1 items-center justify-around">
          {trailingItems.map((item) => <NavLink key={item.href} item={item} />)}

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="更多"
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5",
                  "min-h-[44px] min-w-[44px]",
                  "transition-colors duration-150",
                  moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Ellipsis className="h-5 w-5" />
                <span className="text-[10px] font-medium">更多</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl pb-8">
              <SheetHeader className="mb-4">
                <SheetTitle className="text-center">更多功能</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-4">
                {visibleMoreItems.map((item) => {
                  const Icon = getIcon(item);
                  const active = isActive(item.href, pathname);
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setSheetOpen(false)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
