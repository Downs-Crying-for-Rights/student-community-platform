import { describe, it, expect } from "vitest";

/**
 * 知识库列表页面纯函数测试
 *
 * 验证知识库列表页面的纯函数逻辑：
 * - 分类徽章样式映射
 * - 日期格式化
 * - API URL 构建（列表 + 搜索）
 *
 * Validates: Requirements 14.1, 14.4
 */

import {
  KB_CATEGORIES,
  CATEGORY_BADGE_STYLES,
  getCategoryBadgeStyle,
  formatArticleDate,
  buildKBApiUrl,
  buildKBSearchUrl,
} from "../page";

/* ---------- Constants ---------- */

describe("KB_CATEGORIES", () => {
  it("has five category options including ALL", () => {
    expect(KB_CATEGORIES).toHaveLength(5);
  });

  it("first option is ALL", () => {
    expect(KB_CATEGORIES[0].value).toBe("ALL");
    expect(KB_CATEGORIES[0].label).toBe("全部");
  });

  it("includes expected categories", () => {
    const values = KB_CATEGORIES.map((c) => c.value);
    expect(values).toContain("政策学习");
    expect(values).toContain("合规渠道");
    expect(values).toContain("权益须知");
    expect(values).toContain("平台指南");
  });
});

describe("CATEGORY_BADGE_STYLES", () => {
  it("has styles for known categories", () => {
    expect(CATEGORY_BADGE_STYLES).toHaveProperty("政策学习");
    expect(CATEGORY_BADGE_STYLES).toHaveProperty("合规渠道");
    expect(CATEGORY_BADGE_STYLES).toHaveProperty("权益须知");
    expect(CATEGORY_BADGE_STYLES).toHaveProperty("平台指南");
  });

  it("each style is a non-empty string", () => {
    for (const key of Object.keys(CATEGORY_BADGE_STYLES)) {
      expect(CATEGORY_BADGE_STYLES[key]).toBeTruthy();
    }
  });
});

/* ---------- getCategoryBadgeStyle ---------- */

describe("getCategoryBadgeStyle", () => {
  it("returns correct style for known categories", () => {
    expect(getCategoryBadgeStyle("政策学习")).toContain("bg-blue");
    expect(getCategoryBadgeStyle("合规渠道")).toContain("bg-green");
    expect(getCategoryBadgeStyle("权益须知")).toContain("bg-purple");
    expect(getCategoryBadgeStyle("平台指南")).toContain("bg-amber");
  });

  it("returns fallback style for unknown category", () => {
    const style = getCategoryBadgeStyle("未知分类");
    expect(style).toContain("bg-slate");
  });
});

/* ---------- formatArticleDate ---------- */

describe("formatArticleDate", () => {
  it("formats a valid ISO date string", () => {
    const result = formatArticleDate("2024-06-15T10:30:00.000Z");
    expect(result).toContain("2024");
    expect(result).toContain("06");
    expect(result).toContain("15");
  });

  it("returns original string for invalid date", () => {
    expect(formatArticleDate("invalid")).toBe("invalid");
  });

  it("returns original string for empty string", () => {
    expect(formatArticleDate("")).toBe("");
  });
});

/* ---------- buildKBApiUrl ---------- */

describe("buildKBApiUrl", () => {
  it("builds URL without category filter when ALL is selected", () => {
    const url = buildKBApiUrl("ALL", 1, 20);
    expect(url).toBe("/api/kb?page=1&pageSize=20");
    expect(url).not.toContain("category=");
  });

  it("includes category parameter for specific filter", () => {
    const url = buildKBApiUrl("政策学习", 1, 20);
    expect(url).toContain("category=");
    expect(url).toContain("page=1");
    expect(url).toContain("pageSize=20");
  });

  it("includes correct page number", () => {
    const url = buildKBApiUrl("合规渠道", 3, 10);
    expect(url).toContain("page=3");
    expect(url).toContain("pageSize=10");
  });
});

/* ---------- buildKBSearchUrl ---------- */

describe("buildKBSearchUrl", () => {
  it("builds search URL with query parameter", () => {
    const url = buildKBSearchUrl("政策", 1, 20);
    expect(url).toContain("/api/kb/search?");
    expect(url).toContain("q=");
    expect(url).toContain("page=1");
    expect(url).toContain("pageSize=20");
  });

  it("includes correct page number for pagination", () => {
    const url = buildKBSearchUrl("合规", 2, 10);
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=10");
  });

  it("encodes special characters in query", () => {
    const url = buildKBSearchUrl("test query", 1, 20);
    expect(url).toContain("q=test+query");
  });
});
