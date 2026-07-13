"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Home, Compass, Plus, MessageCircle, Ellipsis,
  User, MessagesSquare, Shield, ShieldCheck,
  FileText, Lock, Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

export interface BottomNavProps {
  unreadCount?: number;
}

/* ========== Constants ========== */

const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0, TRUSTED_USER: 1, DCR_HELPER: 2,
  MODERATOR: 3, ADMIN: 4, SUPER_ADMIN: 5,
};

interface MoreItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole?: string;
  requireDcrAccess?: boolean;
  requirePsychAccess?: boolean;
}

/** Items shown in the "更多" slide-up sheet */
const moreItems: MoreItem[] = [
  { href: "/u/me", label: "我的", icon: User },
  { href: "/messages?tab=chat", label: "群聊", icon: MessagesSquare },
  { href: "/dcr", label: "DCR 互助", icon: ShieldCheck, requireDcrAccess: true },
  { href: "/dcr/tasks", label: "互助任务", icon: FileText, requireDcrAccess: true },
  { href: "/dcr/tickets", label: "我的工单", icon: Lock, requireDcrAccess: true },
  { href: "/psych", label: "心理区", icon: Heart, requirePsychAccess: true },
  { href: "/moderation", label: "审核管理", icon: Shield, minRole: "MODERATOR" },
];

/* ========== Component ========== */

export function BottomNav({ unreadCount = 0 }: BottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = (session?.user?.role as string) ?? "USER";
  const [dcrAccess, setDcrAccess] = useState(false);
  const [psychAccess, setPsychAccess] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Fetch access flags from user profile
  useEffect(() => {
    const userId = (session?.user as any)?.id;
    if (!userId) return;
    fetch(`/api/users/${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setDcrAccess(data.user.dcrAccess ?? false);
          setPsychAccess(data.user.psychAccess ?? false);
        }
      })
      .catch(() => {});
  }, [session]);

  function isActive(href: string) {
    const chatView = pathname.startsWith("/chat")
      || (pathname === "/messages" && searchParams.get("tab") === "chat");
    if (href === "/messages?tab=chat") return chatView;
    if (href === "/messages") return pathname.startsWith("/messages") && !chatView;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function hasMinRole(minRole?: string) {
    if (!minRole) return true;
    return (ROLE_HIERARCHY[role] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 999);
  }

  function isMoreActive(): boolean {
    const activeMore = moreItems.some((item) => {
      if (!hasMinRole(item.minRole)) return false;
      if (item.requireDcrAccess && !dcrAccess) return false;
      if (item.requirePsychAccess && !psychAccess) return false;
      return isActive(item.href);
    });
    return activeMore;
  }

  // Fixed 5 slots: 首页 | 发现 | [发布] | 消息 | 更多
  function NavLink({ href, label, icon: Icon, badge }: {
    href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number;
  }) {
    const active = isActive(href);
    return (
      <Link
        href={href}
        aria-label={label}
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
          {badge != null && badge > 0 && (
            <span className="absolute -right-2 -top-1.5 flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span className="text-[10px] font-medium">{label}</span>
      </Link>
    );
  }

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
        {/* Slot 1-2: 首页, 发现 */}
        <div className="flex flex-1 items-center justify-around">
          <NavLink href="/" label="首页" icon={Home} />
          <NavLink href="/discover" label="发现" icon={Compass} />
        </div>

        {/* Slot 3: 发布 (raised center) */}
        <div className="relative flex w-[56px] shrink-0 items-end justify-center self-stretch pb-0.5">
          <Link
            href="/create"
            aria-label="发布"
            aria-current={isActive("/create") ? "page" : undefined}
            className="absolute bottom-0 flex flex-col items-center justify-center"
            style={{ transform: "translateY(-8px)" }}
          >
            <span className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform duration-150 active:scale-95",
              isActive("/create")
                ? "bg-primary text-primary-foreground"
                : "bg-primary text-primary-foreground",
            )}>
              <Plus className="h-6 w-6" />
            </span>
            <span className="mt-0.5 text-[10px] font-medium text-primary">发布</span>
          </Link>
        </div>

        {/* Slot 4: 消息 */}
        <div className="flex flex-1 items-center justify-around">
          <NavLink href="/messages" label="消息" icon={MessageCircle} badge={unreadCount} />

          {/* Slot 5: 更多 — opens sheet */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="更多"
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5",
                  "min-h-[44px] min-w-[44px]",
                  "transition-colors duration-150",
                  isMoreActive() ? "text-primary" : "text-muted-foreground hover:text-foreground",
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
                {moreItems.filter((item) => {
                  if (!hasMinRole(item.minRole)) return false;
                  if (item.requireDcrAccess && !dcrAccess) return false;
                  if (item.requirePsychAccess && !psychAccess) return false;
                  return true;
                }).map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSheetOpen(false)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent text-muted-foreground",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </Link>
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
