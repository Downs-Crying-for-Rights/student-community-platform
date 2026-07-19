import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("AiReviewPanel", () => {
  const source = readFileSync(path.resolve(__dirname, "../AiReviewPanel.tsx"), "utf8");

  it("labels AI results as non-authoritative and sends only target identifiers", () => {
    expect(source).toContain("AI 结论不能替代人工审核");
    expect(source).toContain("最终操作及责任由人工审核者确认");
    expect(source).toContain("/api/ai/reviews/${targetType}/${targetId}");
    expect(source).not.toContain("JSON.stringify({ content");
  });
});
