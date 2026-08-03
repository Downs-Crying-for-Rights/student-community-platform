import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  bottomMoreNavItems,
  isActive,
  sidebarCoreNavItems,
} from "../navigation-config";

const SRC = path.resolve(__dirname, "../../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), "utf8");
}

function walkTsx(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkTsx(target);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [target] : [];
  });
}

describe("统一会员导航壳", () => {
  it("移动端更多菜单保留群聊入口", () => {
    const source = read("components/layout/BottomNav.tsx");
    expect(bottomMoreNavItems).toContainEqual(
      expect.objectContaining({ href: "/messages?tab=chat", label: "群聊" }),
    );
    expect(source).toContain("MessagesSquare");
  });

  it("PC 左侧菜单直接显示群聊入口", () => {
    const source = read("components/layout/Sidebar.tsx");
    expect(sidebarCoreNavItems).toContainEqual(
      expect.objectContaining({ href: "/messages?tab=chat", label: "群聊" }),
    );
    expect(source).toContain("MessagesSquare");
  });

  it("全局导航不依赖查询参数或 Suspense 才能渲染", () => {
    for (const file of ["components/layout/BottomNav.tsx", "components/layout/Sidebar.tsx"]) {
      const source = read(file);
      expect(source).not.toContain("useSearchParams");
      expect(source).toContain("isActive(");
    }
    expect(isActive("/messages?tab=chat", "/chat/123")).toBe(true);
    expect(isActive("/messages", "/messages/123")).toBe(true);

    const shell = read("components/layout/MemberShell.tsx");
    expect(shell).not.toContain("Suspense");
  });

  it("消息页根据 URL 参数控制群聊标签", () => {
    const source = read("app/messages/page.tsx");
    expect(source).toContain("useSearchParams");
    expect(source).toContain('searchParams.get("tab")');
    expect(source).toContain("<Tabs value={activeTab} onValueChange={handleTabChange}>");
    expect(source).toContain('<TabsContent value="chat">');
    expect(source).toContain('<TabsTrigger value="all"');
    expect(source).toContain('<TabsTrigger value="interactive"');
    expect(source).toContain('<TabsTrigger value="system"');
    expect(source).toContain('<TabsTrigger value="chat"');
    expect(source).toContain("系统通知");
  });

  it("主导航使用完整页面跳转，避免复用旧路由树", () => {
    for (const file of ["components/layout/BottomNav.tsx", "components/layout/Sidebar.tsx"]) {
      const source = read(file);
      expect(source).not.toContain('from "next/link"');
      expect(source).toContain("<a");
    }

    const middleware = read("middleware.ts");
    expect(middleware).toContain("private, no-store, no-cache, must-revalidate, max-age=0");

    const rootLayout = read("app/layout.tsx");
    expect(rootLayout).toContain('export const dynamic = "force-dynamic"');
    expect(rootLayout).toContain("export const revalidate = 0");
    expect(rootLayout).toContain('export const fetchCache = "force-no-store"');

    const topBar = read("components/layout/TopBar.tsx");
    expect(topBar).toContain('<a href="/messages"');

    const chatRedirect = read("app/chat/page.tsx");
    expect(chatRedirect).toContain('window.location.replace("/messages?tab=chat")');
  });

  it("全局导航只由 MemberShell 挂载", () => {
    const shell = read("components/layout/MemberShell.tsx");
    expect(shell.match(/<TopBar[^>]*\/>/g)).toHaveLength(1);
    expect(shell.match(/<Sidebar[^>]*\/>/g)).toHaveLength(1);
    expect(shell.match(/<BottomNav[^>]*\/>/g)).toHaveLength(1);
    expect(shell).toContain("data-navigation-region");
    expect(shell).toContain("data-content-region");
    expect(shell).toContain("<TopBar unreadCount={unreadCount} />");
    expect(shell).toContain("<Sidebar unreadCount={unreadCount} />");
    expect(shell).toContain("<BottomNav unreadCount={unreadCount} />");

    const appDir = path.join(SRC, "app");
    for (const file of walkTsx(appDir)) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.relative(SRC, file)} 不应自行挂载全局导航`).not.toMatch(
        /<(?:TopBar|Sidebar|BottomNav|PageShell)\s*\/?\s*>/,
      );
    }
  });

  it("全局导航统一轮询未读通知数", () => {
    const shell = read("components/layout/MemberShell.tsx");
    expect(shell).toContain('fetch("/api/notifications?pageSize=1"');
    expect(shell).toContain('status !== "authenticated"');
    expect(shell).toContain("window.setInterval(loadUnreadCount, 30_000)");
    expect(shell).toContain("window.clearInterval(timer)");
    expect(shell).toContain('window.addEventListener("notifications:changed", loadUnreadCount)');
    expect(shell).toContain('window.removeEventListener("notifications:changed", loadUnreadCount)');
  });

  it("页面不再重复应用 PC 侧栏偏移", () => {
    const appDir = path.join(SRC, "app");
    for (const file of walkTsx(appDir)) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.relative(SRC, file)} 不应重复设置 lg:ml-60`).not.toContain("lg:ml-60");
    }
  });

  it("桌面导航层与内容层彼此独立，内容层统一避让侧栏", () => {
    const shell = read("components/layout/MemberShell.tsx");
    expect(shell).toMatch(/data-navigation-region[\s\S]*?<Sidebar[\s\S]*?<BottomNav[\s\S]*?<\/div>/);
    expect(shell).toMatch(/data-content-region[\s\S]*?lg:ml-60[\s\S]*?<TopBar[\s\S]*?id="main-content"/);
  });
});
