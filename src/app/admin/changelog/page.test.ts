import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CHANGELOG } from "@/lib/changelog";
import { adminNavItems } from "@/components/layout/navigation-config";

describe("admin changelog", () => {
  it("shows newest releases first with structured changes", () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(4);
    expect(CHANGELOG[0].version).toBe("0.3.5");
    expect(CHANGELOG[0].changes).toContain("管理员驳回争议后自动恢复到争议前状态，可继续沟通、补充证据和结案。");
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
  });
});
