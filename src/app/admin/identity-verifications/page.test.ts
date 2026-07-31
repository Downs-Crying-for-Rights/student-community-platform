import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("身份认证后台下线", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/admin/identity-verifications/page.tsx"), "utf8");

  it("不再发布审核界面并重定向到用户管理", () => {
    expect(source).toContain('redirect("/admin/users")');
    expect(source).not.toContain("hasEvidence");
  });
});
