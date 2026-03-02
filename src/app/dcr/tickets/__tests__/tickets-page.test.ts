import { describe, it, expect } from "vitest";

/**
 * 工单列表页面纯函数测试
 *
 * 验证工单列表页面的纯函数逻辑：
 * - 状态标签映射
 * - 分类标签映射
 * - 日期格式化
 * - API URL 构建
 *
 * Validates: Requirements 36.2
 */

import {
  CASE_STATUS_OPTIONS,
  STATUS_BADGE_CONFIG,
  CATEGORY_LABELS,
  getStatusLabel,
  getCategoryLabel,
  formatListDate,
  buildCasesApiUrl,
  FLOW_STEPS,
  FLOW_GUIDE_TEXTS,
} from "../page";

/* ---------- Constants ---------- */

describe("CASE_STATUS_OPTIONS", () => {
  it("has five filter options including ALL", () => {
    expect(CASE_STATUS_OPTIONS).toHaveLength(5);
  });

  it("first option is ALL", () => {
    expect(CASE_STATUS_OPTIONS[0].value).toBe("ALL");
    expect(CASE_STATUS_OPTIONS[0].label).toBe("全部");
  });

  it("includes all four case statuses", () => {
    const values = CASE_STATUS_OPTIONS.map((o) => o.value);
    expect(values).toContain("OPENED");
    expect(values).toContain("IN_PROGRESS");
    expect(values).toContain("NEED_MORE_INFO");
    expect(values).toContain("CLOSED");
  });
});

describe("STATUS_BADGE_CONFIG", () => {
  it("has config for all four statuses", () => {
    expect(STATUS_BADGE_CONFIG).toHaveProperty("OPENED");
    expect(STATUS_BADGE_CONFIG).toHaveProperty("IN_PROGRESS");
    expect(STATUS_BADGE_CONFIG).toHaveProperty("NEED_MORE_INFO");
    expect(STATUS_BADGE_CONFIG).toHaveProperty("CLOSED");
  });

  it("each config has label, className, and icon", () => {
    for (const key of Object.keys(STATUS_BADGE_CONFIG)) {
      const config = STATUS_BADGE_CONFIG[key];
      expect(config.label).toBeTruthy();
      expect(config.className).toBeTruthy();
      expect(config.icon).toBeDefined();
    }
  });
});

describe("CATEGORY_LABELS", () => {
  it("maps all four categories", () => {
    expect(CATEGORY_LABELS.TUTORING).toBe("补课");
    expect(CATEGORY_LABELS.FEES).toBe("收费");
    expect(CATEGORY_LABELS.WEEKENDS).toBe("双休");
    expect(CATEGORY_LABELS.OTHER).toBe("其他");
  });
});

/* ---------- getStatusLabel ---------- */

describe("getStatusLabel", () => {
  it("returns Chinese label for known statuses", () => {
    expect(getStatusLabel("OPENED")).toBe("待处理");
    expect(getStatusLabel("IN_PROGRESS")).toBe("处理中");
    expect(getStatusLabel("NEED_MORE_INFO")).toBe("待补充");
    expect(getStatusLabel("CLOSED")).toBe("已关闭");
  });

  it("returns raw status for unknown status", () => {
    expect(getStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

/* ---------- getCategoryLabel ---------- */

describe("getCategoryLabel", () => {
  it("returns Chinese label for known categories", () => {
    expect(getCategoryLabel("TUTORING")).toBe("补课");
    expect(getCategoryLabel("FEES")).toBe("收费");
    expect(getCategoryLabel("WEEKENDS")).toBe("双休");
    expect(getCategoryLabel("OTHER")).toBe("其他");
  });

  it("returns raw category for unknown category", () => {
    expect(getCategoryLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

/* ---------- formatListDate ---------- */

describe("formatListDate", () => {
  it("formats a valid ISO date string", () => {
    const result = formatListDate("2024-03-20T08:00:00.000Z");
    expect(result).toContain("2024");
    expect(result).toContain("03");
    expect(result).toContain("20");
  });

  it("returns original string for invalid date", () => {
    expect(formatListDate("invalid")).toBe("invalid");
  });
});

/* ---------- buildCasesApiUrl ---------- */

describe("buildCasesApiUrl", () => {
  it("builds URL without status filter when ALL is selected", () => {
    const url = buildCasesApiUrl("ALL", 1, 20);
    expect(url).toBe("/api/cases?page=1&pageSize=20");
    expect(url).not.toContain("status=");
  });

  it("includes status parameter for specific filter", () => {
    const url = buildCasesApiUrl("OPENED", 1, 20);
    expect(url).toContain("status=OPENED");
    expect(url).toContain("page=1");
    expect(url).toContain("pageSize=20");
  });

  it("includes correct page number", () => {
    const url = buildCasesApiUrl("IN_PROGRESS", 3, 10);
    expect(url).toContain("page=3");
    expect(url).toContain("pageSize=10");
    expect(url).toContain("status=IN_PROGRESS");
  });
});


/* ---------- FLOW_STEPS (Flow Guide) ---------- */

/**
 * Validates: Requirements 2.3, 2.4
 */
describe("FLOW_STEPS", () => {
  it("has four status steps in correct order", () => {
    expect(FLOW_STEPS).toHaveLength(4);
    expect(FLOW_STEPS[0].status).toBe("OPENED");
    expect(FLOW_STEPS[1].status).toBe("IN_PROGRESS");
    expect(FLOW_STEPS[2].status).toBe("NEED_MORE_INFO");
    expect(FLOW_STEPS[3].status).toBe("CLOSED");
  });

  it("each step has label and description", () => {
    for (const step of FLOW_STEPS) {
      expect(step.label).toBeTruthy();
      expect(step.description).toBeTruthy();
    }
  });

  it("labels match STATUS_BADGE_CONFIG labels", () => {
    for (const step of FLOW_STEPS) {
      expect(step.label).toBe(STATUS_BADGE_CONFIG[step.status].label);
    }
  });
});

/* ---------- FLOW_GUIDE_TEXTS ---------- */

describe("FLOW_GUIDE_TEXTS", () => {
  it("has admission and ticket flow descriptions", () => {
    expect(FLOW_GUIDE_TEXTS.admissionTitle).toBe("准入审核");
    expect(FLOW_GUIDE_TEXTS.admissionDesc).toBeTruthy();
    expect(FLOW_GUIDE_TEXTS.ticketTitle).toBe("工单互助流程");
    expect(FLOW_GUIDE_TEXTS.ticketDesc).toBeTruthy();
  });

  it("admission description mentions four-step process", () => {
    expect(FLOW_GUIDE_TEXTS.admissionDesc).toContain("四步流程");
  });

  it("ticket description mentions the create-to-close flow", () => {
    expect(FLOW_GUIDE_TEXTS.ticketDesc).toContain("新建工单");
    expect(FLOW_GUIDE_TEXTS.ticketDesc).toContain("关闭");
  });
});
