"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Search, Plus, Bell, UserPlus, Shield, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TopBarProps {
  /** Number of unread notifications to display on the bell badge */
  unreadCount?: number;
}

export function TopBar({ unreadCount = 0 }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [query, setQuery] = useState("");

  const isHome = pathname === "/";
  const userRole = (session?.user as { role?: string } | undefined)?.role;

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "border-b border-border/40 bg-background/80 backdrop-blur-md",
        "supports-[backdrop-filter]:bg-background/60"
      )}
    >
      <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-4">
        {/* Left: Logo or Back button */}
        <div className="flex shrink-0 items-center">
          {isHome ? (
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-foreground"
              aria-label="学互会首页"
            >
              学互会
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              aria-label="返回上一页"
              className="min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Center: Search box */}
        <form
          onSubmit={handleSearch}
          className="flex flex-1 items-center"
          role="search"
        >
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索帖子、话题..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 pr-3"
              aria-label="搜索"
            />
          </div>
        </form>

        {/* Right: Auth-aware actions */}
        <div className="flex shrink-0 items-center gap-1">
          {status === "loading" ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : session?.user ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="min-h-[44px] min-w-[44px]"
              >
                <Link href="/create" aria-label="发布帖子">
                  <Plus className="h-5 w-5" />
                </Link>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                asChild
                className="relative min-h-[44px] min-w-[44px]"
              >
                <Link href="/messages" aria-label="消息通知">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span
                      className={cn(
                        "absolute -right-0.5 -top-0.5 flex items-center justify-center",
                        "min-w-[18px] rounded-full bg-destructive px-1 py-0.5",
                        "text-[10px] font-medium leading-none text-destructive-foreground"
                      )}
                      aria-label={`${unreadCount} 条未读消息`}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              </Button>

              {/* Admin link for MODERATOR+ */}
              {(userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userRole === "MODERATOR") && (
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className="min-h-[44px] min-w-[44px]"
                >
                  <Link href="/admin/users" aria-label="管理后台">
                    <Shield className="h-5 w-5" />
                  </Link>
                </Button>
              )}

              {/* Avatar with notification dot */}
              <Link
                href="/settings/profile"
                aria-label="个人中心"
                className="relative ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt="头像"
                    width={32}
                    height={32}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                    {(session.user.name || session.user.email || "U").charAt(0).toUpperCase()}
                  </div>
                )}
                {unreadCount > 0 && (
                  <span
                    className="absolute bottom-2 left-2 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background"
                    aria-hidden="true"
                  />
                )}
              </Link>

              {/* Logout */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut({ callbackUrl: "/" })}
                aria-label="退出登录"
                className="min-h-[44px] min-w-[44px]"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              asChild
              className="gap-1.5"
            >
              <Link href="/login?view=register">
                <UserPlus className="h-4 w-4" />
                注册 / 登录
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
