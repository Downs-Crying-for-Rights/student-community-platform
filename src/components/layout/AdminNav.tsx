"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { adminMenuGroups, isActive, isVisible } from "./navigation-config";
import { cn } from "@/lib/utils";

export function AdminNav({ role = "MODERATOR" }: { role?: string }) {
  const pathname = usePathname();
  const groups = adminMenuGroups.map((group) => ({ ...group, children: group.children.filter((item) => isVisible(item, role)) })).filter((group) => group.children.length > 0);
  const activeGroup = groups.find((group) => group.children.some((item) => isActive(item.href, pathname))) ?? groups[0];

  return <nav className="border-b bg-background" aria-label="管理后台导航">
    <div className="mx-auto flex max-w-screen-xl items-center gap-1 overflow-x-auto px-4">
      <Link href="/" className="flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm text-muted-foreground"><Home className="h-4 w-4" />首页</Link>
      <span className="mx-1 h-4 w-px bg-border" />
      {groups.map((group) => {
        const active = group.id === activeGroup?.id;
        return <Link key={group.id} href={group.children[0].href} className={cn("whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium", active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{group.label}</Link>;
      })}
    </div>
    {activeGroup && <div className="border-t bg-muted/20"><div className="mx-auto flex max-w-screen-xl gap-1 overflow-x-auto px-4 py-2">{activeGroup.children.map((item) => <Link key={item.href} href={item.href} aria-current={isActive(item.href, pathname) ? "page" : undefined} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", isActive(item.href, pathname) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>{item.label}</Link>)}</div></div>}
  </nav>;
}
