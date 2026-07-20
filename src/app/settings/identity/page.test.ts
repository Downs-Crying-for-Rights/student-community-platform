import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("身份认证申请页", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/settings/identity/page.tsx"), "utf8");

  it("只提供三种照片认证方式", () => {
    expect(source).toContain("学生证件合照（学生认证）");
    expect(source).toContain("手持身份证半身照（真实身份认证）");
    expect(source).toContain("学校校服半身照（学生认证）");
    expect(source).not.toContain('value: "REAL_NAME_ID"');
  });

  it("收集实名、学校名称和材料确认", () => {
    expect(source).toContain('body.set("realName", realName)');
    expect(source).toContain('body.set("schoolName", schoolName)');
    expect(source).toContain('body.set("dcrOnlyNoteConfirmed", "true")');
    expect(source).toContain('body.set("nonShenzhenUniformConfirmed", "true")');
  });
});
