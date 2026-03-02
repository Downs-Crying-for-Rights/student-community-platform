"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Ticket, FileText, LayoutGrid, Home, MessageSquare, BookOpen, ShieldCheck, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const adminLinks = [
  { href: "/moderation", label: "审核看板", icon: Shield },
  { href: "/admin/users", label: "用户管理", icon: Users },
  { href: "/admin/content", label: "内容管理", icon: MessageSquare },
  { href: "/admin/invites", label: "邀请码", icon: Ticket },
  { href: "/admin/audit", label: "操作日志", icon: FileText },
  { href: "/admin/boards", label: "板块管理", icon: LayoutGrid },
  { href: "/admin/kb", label: "知识库", icon: BookOpen },
  { href: "/admin/applications", label: "准入审核", icon: ShieldCheck },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-background" aria-label="管理后台导航">
      <div className="mx-auto flex max-w-screen-xl items-center gap-1 overflow-x-auto px-4">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors",
            "text-muted-foreground hover:text-foreground"
          )}
          aria-label="返回首页"
        >
          <Home className="h-4 w-4" />
          首页
        </Link>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        {adminLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
