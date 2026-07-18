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

  it("需补充委托加载原记录并更新同一个 Case", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    expect(source).toContain('new URLSearchParams(window.location.search).get("edit")');
    expect(source).toContain('requestStatus !== "NEED_MORE_INFO"');
    expect(source).toContain('_action: "supplement"');
    expect(source).toContain('method: editCaseId ? "PATCH" : "POST"');
  });
});
