import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("QQ official bot admin", () => {
  it("adds a local submenu without exposing secrets", () => {
    const nav = read("app/admin/qq-bot/QQBotSectionNav.tsx");
    const panel = read("app/admin/qq-bot/official/QQOfficialBotPanel.tsx");
    expect(nav).toContain("个人 QQ 机器人");
    expect(nav).toContain("QQ 官方机器人");
    expect(nav).toContain("pathname === item.href");
    expect(panel).not.toContain("clientSecret");
    expect(panel).toContain("TEST_CONNECTION");
  });

  it("keeps the official management page super-admin only", () => {
    const page = read("app/admin/qq-bot/official/page.tsx");
    expect(page).toContain('session?.user?.role !== "SUPER_ADMIN"');
    expect(page).toContain('redirect("/403")');
  });
});
