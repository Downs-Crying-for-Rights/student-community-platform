import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("邮件投递日志栏目", () => {
  const source = readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

  it("在系统日志中提供仅筛选 mail 来源的独立栏目", () => {
    expect(source).toContain('TabsTrigger value="mail"');
    expect(source).toContain('<StructuredLogs fixedSource="mail" />');
    expect(source).toContain("不记录邮件正文、授权码或密码");
  });
});
