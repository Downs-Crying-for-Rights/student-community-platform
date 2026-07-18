import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("已审核委托表复用", () => {
  it("委托页提供免重复审核发布入口", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    expect(source).toContain('fetch("/api/dcr/tasks/from-case")');
    expect(source).toContain("使用已审核委托表");
    expect(source).toContain("直接发布委托");
    expect(source).toContain("管理员已审核，无须重复提交");
  });

  it("审核记录页将已通过委托引导到直接发布入口", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../requests/page.tsx"), "utf8");
    expect(source).toContain('<Link href="/dcr/delegate">直接发布委托</Link>');
    expect(source).not.toContain('<Link href="/dcr/quiz">参加入频考核</Link>');
  });
});
