import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("身份认证后台", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/admin/identity-verifications/page.tsx"), "utf8");

  it("组合方式同时读取照片和结构化信息", () => {
    expect(source).toContain("if (item.hasEvidence)");
    expect(source).toContain("if (item.hasIdentityDetails)");
    expect(source).toContain("学校名称");
    expect(source).toContain("深圳统一校服");
  });
});
