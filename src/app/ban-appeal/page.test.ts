import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("封禁申诉页面", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/ban-appeal/page.tsx"), "utf8");

  it("展示封禁原因并提供申诉通道", () => {
    expect(source).toContain("封禁原因与申诉");
    expect(source).toContain("context.punishment.reason");
    expect(source).toContain('fetch("/api/punishments/ban-appeal"');
    expect(source).toContain('maxLength={5000}');
  });
});
