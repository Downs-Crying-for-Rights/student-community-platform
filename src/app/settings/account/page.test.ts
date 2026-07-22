import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("账号注销页面", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/settings/account/page.tsx"), "utf8");

  it("要求验证码和注销须知确认", () => {
    expect(source).toContain("/api/account/deletion-verification");
    expect(source).toContain("手机号");
    expect(source).toContain("邮箱");
    expect(source).toContain("我已阅读并同意");
    expect(source).toContain("《注销须知》");
    expect(source).toContain("noticeRevision: notice.revision");
  });
});
