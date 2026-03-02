import { describe, it, expect } from "vitest";

/**
 * 工单详情页面纯函数测试
 *
 * 验证工单详情页面的纯函数逻辑：
 * - 状态标签映射
 * - 分类标签映射
 * - 日期格式化
 * - 表单字段标签映射
 * - 导出按钮可见性
 *
 * Validates: Requirements 36.4, 36.5, 36.6
 */

import {
  STATUS_CONFIG,
  CATEGORY_LABELS,
  FORM_FIELD_LABELS,
  getDetailStatusLabel,
  getDetailCategoryLabel,
  formatDetailDate,
  getFormFieldLabel,
  shouldShowExportButton,
} from "../[id]/page";

/* ---------- STATUS_CONFIG ---------- */

describe("STATUS_CONFIG", () => {
  it("has config for all four statuses", () => {
    expect(STATUS_CONFIG).toHaveProperty("OPENED");
    expect(STATUS_CONFIG).toHaveProperty("IN_PROGRESS");
    expect(STATUS_CONFIG).toHaveProperty("NEED_MORE_INFO");
    expect(STATUS_CONFIG).toHaveProperty("CLOSED");
  });

  it("each config has label and className", () => {
    for (const key of Object.keys(STATUS_CONFIG)) {
      const config = STATUS_CONFIG[key];
      expect(config.label).toBeTruthy();
      expect(config.className).toBeTruthy();
    }
  });
});

/* ---------- getDetailStatusLabel ---------- */

describe("getDetailStatusLabel", () => {
  it("returns Chinese label for known statuses", () => {
    expect(getDetailStatusLabel("OPENED")).toBe("待处理");
    expect(getDetailStatusLabel("IN_PROGRESS")).toBe("处理中");
    expect(getDetailStatusLabel("NEED_MORE_INFO")).toBe("待补充");
    expect(getDetailStatusLabel("CLOSED")).toBe("已关闭");
  });

  it("returns raw status for unknown status", () => {
    expect(getDetailStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

/* ---------- getDetailCategoryLabel ---------- */

describe("getDetailCategoryLabel", () => {
  it("returns Chinese label for known categories", () => {
    expect(getDetailCategoryLabel("TUTORING")).toBe("补课");
    expect(getDetailCategoryLabel("FEES")).toBe("收费");
    expect(getDetailCategoryLabel("WEEKENDS")).toBe("双休");
    expect(getDetailCategoryLabel("OTHER")).toBe("其他");
  });

  it("returns raw category for unknown category", () => {
    expect(getDetailCategoryLabel("SOMETHING")).toBe("SOMETHING");
  });
});

/* ---------- formatDetailDate ---------- */

describe("formatDetailDate", () => {
  it("formats a valid ISO date string with time", () => {
    const result = formatDetailDate("2024-06-15T14:30:00.000Z");
    expect(result).toContain("2024");
    expect(result).toContain("06");
    expect(result).toContain("15");
  });

  it("returns original string for invalid date", () => {
    expect(formatDetailDate("bad-date")).toBe("bad-date");
  });

  it("returns original string for empty string", () => {
    expect(formatDetailDate("")).toBe("");
  });
});

/* ---------- getFormFieldLabel ---------- */

describe("getFormFieldLabel", () => {
  it("returns Chinese label for known form fields", () => {
    expect(getFormFieldLabel("gradeLevel")).toBe("年级");
    expect(getFormFieldLabel("subject")).toBe("涉及科目");
    expect(getFormFieldLabel("feeType")).toBe("收费类型");
    expect(getFormFieldLabel("amount")).toBe("涉及金额");
    expect(getFormFieldLabel("situation")).toBe("当前情况");
    expect(getFormFieldLabel("description")).toBe("事项描述");
    expect(getFormFieldLabel("expectation")).toBe("期望结果");
  });

  it("returns raw key for unknown field", () => {
    expect(getFormFieldLabel("unknownField")).toBe("unknownField");
  });
});

/* ---------- shouldShowExportButton ---------- */

describe("shouldShowExportButton", () => {
  it("returns true for ADMIN role", () => {
    expect(shouldShowExportButton("ADMIN")).toBe(true);
  });

  it("returns false for non-ADMIN roles", () => {
    expect(shouldShowExportButton("USER")).toBe(false);
    expect(shouldShowExportButton("MODERATOR")).toBe(false);
    expect(shouldShowExportButton("DCR_HELPER")).toBe(false);
    expect(shouldShowExportButton("TRUSTED_USER")).toBe(false);
  });

  it("returns false for undefined role", () => {
    expect(shouldShowExportButton(undefined)).toBe(false);
  });
});
