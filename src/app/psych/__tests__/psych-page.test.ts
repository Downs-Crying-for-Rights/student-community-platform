import { describe, it, expect } from "vitest";

/**
 * 心理区主页逻辑测试
 *
 * 验证心理区主页的纯函数逻辑：
 * - 页面分区数据结构
 * - 欢迎信息
 * - 倾诉请求验证
 * - 倾诉状态文本
 *
 * Validates: Requirements 35.1, 35.2, 35.3, 35.4, 8.7, 8.8
 */

import { getPsychSections, getPsychWelcomeMessage } from "../page";
import {
  validateConfideSummary,
  getConfideStatusText,
} from "../confide/page";

/* ---------- Psych Sections ---------- */

describe("getPsychSections", () => {
  it("returns three sections", () => {
    const sections = getPsychSections();
    expect(sections).toHaveLength(3);
  });

  it("each section has required fields", () => {
    const sections = getPsychSections();
    for (const section of sections) {
      expect(section.id).toBeTruthy();
      expect(section.title).toBeTruthy();
      expect(section.description).toBeTruthy();
      expect(section.href).toBeTruthy();
      expect(section.iconName).toBeTruthy();
    }
  });

  it("includes tree-hole section", () => {
    const sections = getPsychSections();
    const treeHole = sections.find((s) => s.id === "tree-hole");
    expect(treeHole).toBeDefined();
    expect(treeHole!.title).toContain("匿名树洞");
  });

  it("includes confide section", () => {
    const sections = getPsychSections();
    const confide = sections.find((s) => s.id === "confide");
    expect(confide).toBeDefined();
    expect(confide!.href).toBe("/psych/confide");
  });

  it("includes resources section", () => {
    const sections = getPsychSections();
    const resources = sections.find((s) => s.id === "resources");
    expect(resources).toBeDefined();
    expect(resources!.title).toContain("求助资源");
  });

  it("all sections have unique ids", () => {
    const sections = getPsychSections();
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ---------- Welcome Message ---------- */

describe("getPsychWelcomeMessage", () => {
  it("returns a non-empty string", () => {
    const msg = getPsychWelcomeMessage();
    expect(msg.length).toBeGreaterThan(0);
  });

  it("mentions warmth and safety", () => {
    const msg = getPsychWelcomeMessage();
    expect(msg).toContain("温暖");
    expect(msg).toContain("安全");
  });
});

/* ---------- Confide Summary Validation ---------- */

describe("validateConfideSummary", () => {
  it("returns error for empty string", () => {
    expect(validateConfideSummary("")).toBeTruthy();
  });

  it("returns error for whitespace-only string", () => {
    expect(validateConfideSummary("   ")).toBeTruthy();
  });

  it("returns error for too short summary", () => {
    expect(validateConfideSummary("短")).toBeTruthy();
    expect(validateConfideSummary("12345")).toBeTruthy();
  });

  it("returns empty string for valid summary", () => {
    expect(validateConfideSummary("这是一段有效的倾诉内容摘要，足够长了")).toBe("");
  });

  it("returns error for summary exceeding 500 characters", () => {
    const longText = "a".repeat(501);
    expect(validateConfideSummary(longText)).toBeTruthy();
  });

  it("accepts summary at exactly 500 characters", () => {
    const text = "a".repeat(500);
    expect(validateConfideSummary(text)).toBe("");
  });

  it("accepts summary at exactly 10 characters", () => {
    const text = "a".repeat(10);
    expect(validateConfideSummary(text)).toBe("");
  });
});

/* ---------- Confide Status Text ---------- */

describe("getConfideStatusText", () => {
  it("returns waiting text for WAITING status", () => {
    const text = getConfideStatusText("WAITING");
    expect(text).toContain("等待匹配");
  });

  it("returns matched text for MATCHED status", () => {
    const text = getConfideStatusText("MATCHED");
    expect(text).toContain("已匹配");
  });

  it("returns active text for ACTIVE status", () => {
    const text = getConfideStatusText("ACTIVE");
    expect(text).toContain("进行中");
  });

  it("returns closed text for CLOSED status", () => {
    const text = getConfideStatusText("CLOSED");
    expect(text).toContain("已结束");
  });

  it("returns empty string for unknown status", () => {
    expect(getConfideStatusText("UNKNOWN")).toBe("");
    expect(getConfideStatusText("")).toBe("");
  });
});
