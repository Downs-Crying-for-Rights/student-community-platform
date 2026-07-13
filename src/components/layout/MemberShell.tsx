"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

/**
 * 会员区路径 — 这些路径下的所有页面自动获得 TopBar + Sidebar + BottomNav 导航壳。
 * 页面自身只需关注内容渲染，无需手动引入任何导航组件。
 */
const MEMBER_ROOTS = [
  "/",
  "/discover",
  "/messages",
  "/create",
  "/chat",
  "/dcr",
  "/admin",
  "/search",
  "/settings",
  "/u",
  "/psych",
  "/apply",
  "/moderation",
];

function isMemberPath(pathname: string): boolean {
  return MEMBER_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(root + "/"),
  );
}

interface MemberShellProps {
  children: React.ReactNode;
}

/**
 * 会员区统一导航壳。
 * - 公有页面（登录、绑定手机、设置用户名、引导页等）：只渲染内容，不加导航
 * - 会员页面：自动包裹 TopBar + Sidebar + BottomNav
 * - 各页面直接写业务内容即可，loading/error/empty 只替换内容区，不影响导航壳
 */
export function MemberShell({ children }: MemberShellProps) {
  const pathname = usePathname();

  // 公有页面 — 不包裹导航
  if (!isMemberPath(pathname)) {
    return <main id="main-content">{children}</main>;
  }

  // 会员页面 — 完整的导航壳
  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-6">
      <TopBar />
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <div id="main-content" className="lg:ml-60">
        {children}
      </div>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
