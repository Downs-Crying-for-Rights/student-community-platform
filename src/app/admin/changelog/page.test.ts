import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CHANGELOG } from "@/lib/changelog";
import { adminNavItems } from "@/components/layout/navigation-config";
import { GIT_HISTORY, GIT_HISTORY_SOURCE_COMMIT } from "@/lib/git-history.generated";

describe("admin changelog", () => {
  it("shows newest releases first with structured changes", () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(4);
    expect(CHANGELOG[0].version).toBe("0.3.28");
    expect(CHANGELOG[0].changes).toContain("QQ 官方机器人私聊完整支持帮助、绑定、注册、状态、新建委托、取消和草稿命令，与个人机器人复用同一业务流程。");
  });

  it("contains the complete reachable Git history in chronological order", () => {
    expect(GIT_HISTORY).toHaveLength(303);
    expect(GIT_HISTORY[0].shortHash).toBe("43445ed");
    expect(GIT_HISTORY_SOURCE_COMMIT).toBe("b6a127c3e9c88c54d2cd913751823d296c509b02");
    expect(GIT_HISTORY.some((commit) => commit.hash === GIT_HISTORY_SOURCE_COMMIT)).toBe(true);
    expect(new Set(GIT_HISTORY.map((commit) => commit.hash)).size).toBe(GIT_HISTORY.length);
    for (let index = 1; index < GIT_HISTORY.length; index += 1) {
      expect(new Date(GIT_HISTORY[index].committedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(GIT_HISTORY[index - 1].committedAt).getTime(),
      );
    }
  });

  it("is available from the admin navigation and displays deployed version", () => {
    expect(adminNavItems).toContainEqual(expect.objectContaining({
      href: "/admin/changelog",
      label: "更新日志",
      minRole: "ADMIN",
    }));
    const source = fs.readFileSync(path.resolve(__dirname, "page.tsx"), "utf8");
    expect(source).toContain("/VERSION?t=");
    expect(source).toContain("当前部署版本");
    expect(source).toContain("完整 Git 时间线");
  });
});
