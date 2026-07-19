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

  it("底部输入栏在移动端避开底部导航，在桌面端避开左侧菜单", () => {
    const thread = fs.readFileSync(path.resolve(__dirname, "../[threadId]/page.tsx"), "utf8");
    expect(thread).toContain("bottom-20 left-0 right-0 z-30");
    expect(thread).toContain("lg:bottom-0 lg:left-60");
    expect(thread).not.toContain("left-1/2");
  });

  it("用户主页可以发起私信", () => {
    const profile = fs.readFileSync(path.resolve(__dirname, "../../../u/[id]/page.tsx"), "utf8");
    expect(profile).toContain('fetch("/api/dm"');
    expect(profile).toContain("发私信");
    expect(profile).toContain("ensureConsent(startDirectMessage)");
  });

  it("私信列表和直接会话均由授权弹窗保护", () => {
    const messages = fs.readFileSync(path.resolve(__dirname, "../../page.tsx"), "utf8");
    const thread = fs.readFileSync(path.resolve(__dirname, "../[threadId]/page.tsx"), "utf8");
    const dialog = fs.readFileSync(path.resolve(__dirname, "../../../../components/dm/DMConsentDialog.tsx"), "utf8");
    expect(messages).toContain("<DMConsentGate><DMThreadList /></DMConsentGate>");
    expect(thread).toContain("<DMConsentGate><DMThreadContent /></DMConsentGate>");
    expect(dialog).toContain('method: "POST"');
    expect(dialog).toContain("不同意");
  });

  it("管理员审查入口仅存在于管理导航", () => {
    const adminNav = fs.readFileSync(path.resolve(__dirname, "../../../../components/layout/navigation-config.ts"), "utf8");
    const userMessages = fs.readFileSync(path.resolve(__dirname, "../../page.tsx"), "utf8");
    expect(adminNav).toContain('/admin/dm');
    expect(userMessages).not.toContain('/admin/dm');
  });
});
