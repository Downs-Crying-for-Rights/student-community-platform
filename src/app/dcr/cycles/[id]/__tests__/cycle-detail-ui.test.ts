import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

describe("cycle detail participant contact UI", () => {
  it("lists distinct other participants and labels the current user dynamically", () => {
    expect(source).toContain("联系其他参与者");
    expect(source).toContain("new Map(cycle.links.flatMap");
    expect(source).toContain('联系 {user.nickname || "未命名参与者"}');
    expect(source).toContain('isFrom ? "（你）" : ""');
    expect(source).toContain('isTo ? "（你）" : ""');
    expect(source).not.toContain("你(A)");
  });
});
