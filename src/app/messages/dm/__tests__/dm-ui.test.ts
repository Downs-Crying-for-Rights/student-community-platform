import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("站内一对一私信", () => {
  it("消息中心包含私信入口和一对一会话页", () => {
    const messages = fs.readFileSync(path.resolve(__dirname, "../../page.tsx"), "utf8");
    const thread = fs.readFileSync(path.resolve(__dirname, "../[threadId]/page.tsx"), "utf8");
    expect(messages).toContain('<TabsTrigger value="dm"');
    expect(messages).toContain("DMThreadList");
    expect(thread).toContain("一对一私信");
    expect(thread).not.toContain("管理员正在查看");
  });

  it("滚动 effect 不把浏览器 API 返回值注册为清理函数", () => {
    const thread = fs.readFileSync(path.resolve(__dirname, "../[threadId]/page.tsx"), "utf8");

    expect(thread).toContain('endRef.current?.scrollIntoView({ behavior: "smooth" });');
    expect(thread).not.toContain('useEffect(() => endRef.current?.scrollIntoView');
  });

  it("用户主页可以发起私信", () => {
    const profile = fs.readFileSync(path.resolve(__dirname, "../../../u/[id]/page.tsx"), "utf8");
    expect(profile).toContain('fetch("/api/dm"');
    expect(profile).toContain("发私信");
  });

  it("管理员审查入口仅存在于管理导航", () => {
    const adminNav = fs.readFileSync(path.resolve(__dirname, "../../../../components/layout/AdminNav.tsx"), "utf8");
    const userMessages = fs.readFileSync(path.resolve(__dirname, "../../page.tsx"), "utf8");
    expect(adminNav).toContain('/admin/dm');
    expect(userMessages).not.toContain('/admin/dm');
  });
});
