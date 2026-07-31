import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("身份认证申请页下线", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/settings/identity/page.tsx"), "utf8");

  it("不再发布材料采集界面并重定向到个人设置", () => {
    expect(source).toContain('redirect("/settings/profile")');
    expect(source).not.toContain("formData");
  });
});
