"use client";

import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * 统一页面壳层 — 包含 TopBar + Sidebar + BottomNav
 * 适用于心理区/DCR/管理后台等所有需要一致导航的页面
 */
export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className={cn("min-h-screen bg-background pb-24 lg:pb-6", className)}>
      <TopBar />
      <Sidebar />
      <main className="mx-auto max-w-screen-xl px-4 pt-4 lg:ml-60">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
