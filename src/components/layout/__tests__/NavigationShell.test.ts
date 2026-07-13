import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

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
    expect(source).toContain('href: "/messages?tab=chat"');
    expect(source).toContain('label: "群聊"');
    expect(source).toContain("MessagesSquare");
  });

  it("PC 左侧菜单直接显示群聊入口", () => {
    const source = read("components/layout/Sidebar.tsx");
    expect(source).toContain('href: "/messages?tab=chat"');
    expect(source).toContain('label: "群聊"');
    expect(source).toContain("MessagesSquare");
  });

  it("全局导航不依赖查询参数或 Suspense 才能渲染", () => {
    for (const file of ["components/layout/BottomNav.tsx", "components/layout/Sidebar.tsx"]) {
      const source = read(file);
      expect(source).not.toContain("useSearchParams");
      expect(source).toContain('href === "/messages?tab=chat"');
      expect(source).toContain('href === "/messages"');
    }

    const shell = read("components/layout/MemberShell.tsx");
    expect(shell).not.toContain("Suspense");
  });

  it("消息页根据 URL 参数控制群聊标签", () => {
    const source = read("app/messages/page.tsx");
    expect(source).toContain("useSearchParams");
    expect(source).toContain('searchParams.get("tab")');
    expect(source).toContain("<Tabs value={activeTab} onValueChange={handleTabChange}>");
    expect(source).toContain('<TabsContent value="chat">');
  });

  it("全局导航只由 MemberShell 挂载", () => {
    const shell = read("components/layout/MemberShell.tsx");
    expect(shell.match(/<TopBar \/>/g)).toHaveLength(1);
    expect(shell.match(/<Sidebar \/>/g)).toHaveLength(1);
    expect(shell.match(/<BottomNav \/>/g)).toHaveLength(1);

    const appDir = path.join(SRC, "app");
    for (const file of walkTsx(appDir)) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.relative(SRC, file)} 不应自行挂载全局导航`).not.toMatch(
        /<(?:TopBar|Sidebar|BottomNav|PageShell)\s*\/?\s*>/,
      );
    }
  });

  it("页面不再重复应用 PC 侧栏偏移", () => {
    const appDir = path.join(SRC, "app");
    for (const file of walkTsx(appDir)) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.relative(SRC, file)} 不应重复设置 lg:ml-60`).not.toContain("lg:ml-60");
    }
  });
});
