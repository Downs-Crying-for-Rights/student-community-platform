import { describe, it, expect } from "vitest";

/**
 * 知识库文章详情页纯函数测试
 *
 * 验证文章详情页的纯函数逻辑：
 * - 分类徽章样式映射
 * - 日期格式化
 * - 可见性标签映射
 *
 * Validates: Requirements 14.1, 14.4
 */

import {
  CATEGORY_BADGE_STYLES,
  getDetailCategoryBadgeStyle,
  formatDetailDate,
  getVisibilityLabel,
} from "../[id]/page";

/* ---------- CATEGORY_BADGE_STYLES ---------- */

describe("CATEGORY_BADGE_STYLES (detail)", () => {
  it("has styles for known categories", () => {
    expect(CATEGORY_BADGE_STYLES).toHaveProperty("政策学习");
    expect(CATEGORY_BADGE_STYLES).toHaveProperty("合规渠道");
    expect(CATEGORY_BADGE_STYLES).toHaveProperty("权益须知");
    expect(CATEGORY_BADGE_STYLES).toHaveProperty("平台指南");
  });
});

/* ---------- getDetailCategoryBadgeStyle ---------- */

describe("getDetailCategoryBadgeStyle", () => {
  it("returns correct style for known categories", () => {
    expect(getDetailCategoryBadgeStyle("政策学习")).toContain("bg-blue");
    expect(getDetailCategoryBadgeStyle("合规渠道")).toContain("bg-green");
  });

  it("returns fallback style for unknown category", () => {
    const style = getDetailCategoryBadgeStyle("未知");
    expect(style).toContain("bg-slate");
  });
});

/* ---------- formatDetailDate ---------- */

describe("formatDetailDate", () => {
  it("formats a valid ISO date string with time", () => {
    const result = formatDetailDate("2024-06-15T10:30:00.000Z");
    expect(result).toContain("2024");
    expect(result).toContain("06");
    expect(result).toContain("15");
  });

  it("returns original string for invalid date", () => {
    expect(formatDetailDate("invalid")).toBe("invalid");
  });

  it("returns original string for empty string", () => {
    expect(formatDetailDate("")).toBe("");
  });
});

/* ---------- getVisibilityLabel ---------- */

describe("getVisibilityLabel", () => {
  it("returns DCR label for DCR_ONLY visibility", () => {
    const result = getVisibilityLabel("DCR_ONLY");
    expect(result.label).toBe("DCR 专属");
    expect(result.className).toContain("bg-red");
  });

  it("returns public label for PUBLIC visibility", () => {
    const result = getVisibilityLabel("PUBLIC");
    expect(result.label).toBe("公开");
    expect(result.className).toContain("bg-emerald");
  });

  it("returns public label for unknown visibility", () => {
    const result = getVisibilityLabel("UNKNOWN");
    expect(result.label).toBe("公开");
  });
});
