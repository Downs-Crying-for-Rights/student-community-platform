"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/qq-bot", label: "个人 QQ 机器人" },
  { href: "/admin/qq-bot/official", label: "QQ 官方机器人" },
] as const;

export function QQBotSectionNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto mt-4 flex max-w-screen-xl gap-2 overflow-x-auto px-4" aria-label="QQ 机器人管理">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
