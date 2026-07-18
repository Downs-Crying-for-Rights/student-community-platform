import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("统一委托入口", () => {
  it("旧任务创建 URL 跳转到统一委托表", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    expect(source).toContain('redirect("/dcr/delegate?source=task")');
  });
});
