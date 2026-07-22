import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CHANGELOG } from "@/lib/changelog";
import { adminNavItems } from "@/components/layout/navigation-config";
import { GIT_HISTORY, GIT_HISTORY_SOURCE_COMMIT } from "@/lib/git-history.generated";

describe("admin changelog", () => {
  it("shows newest releases first with structured changes", () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(4);
    expect(CHANGELOG[0].version).toBe("0.3.14");
    expect(CHANGELOG[0].changes).toContain("修复未加入公开群聊仍能看到最新消息的问题，并增加私信到达通知。");
  });

  it("contains the complete reachable Git history in chronological order", () => {
    expect(GIT_HISTORY).toHaveLength(252);
    expect(GIT_HISTORY[0].shortHash).toBe("43445ed");
    expect(GIT_HISTORY_SOURCE_COMMIT).toBe("218c81c7d58834a83b9d794b49518cfe5be0c1d4");
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
