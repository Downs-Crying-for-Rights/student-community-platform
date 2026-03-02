import { describe, it, expect } from "vitest";

/**
 * TimelineView 组件纯函数测试
 *
 * 验证时间线组件的纯函数逻辑：
 * - 状态点颜色映射
 * - 日期格式化
 *
 * Validates: Requirements 36.4
 */

import {
  getStatusDotColor,
  formatTimelineDate,
} from "../TimelineView";

/* ---------- getStatusDotColor ---------- */

describe("getStatusDotColor", () => {
  it("returns amber for OPENED status", () => {
    expect(getStatusDotColor("OPENED")).toBe("bg-amber-400");
  });

  it("returns blue for IN_PROGRESS status", () => {
    expect(getStatusDotColor("IN_PROGRESS")).toBe("bg-blue-500");
  });

  it("returns orange for NEED_MORE_INFO status", () => {
    expect(getStatusDotColor("NEED_MORE_INFO")).toBe("bg-orange-400");
  });

  it("returns slate for CLOSED status", () => {
    expect(getStatusDotColor("CLOSED")).toBe("bg-slate-400");
  });

  it("returns default slate-300 for null status", () => {
    expect(getStatusDotColor(null)).toBe("bg-slate-300");
  });

  it("returns default slate-300 for unknown status", () => {
    expect(getStatusDotColor("UNKNOWN")).toBe("bg-slate-300");
  });
});

/* ---------- formatTimelineDate ---------- */

describe("formatTimelineDate", () => {
  it("formats a valid ISO date string", () => {
    const result = formatTimelineDate("2024-01-15T10:30:00.000Z");
    // Should contain year, month, day
    expect(result).toContain("2024");
    expect(result).toContain("01");
    expect(result).toContain("15");
  });

  it("returns original string for invalid date", () => {
    expect(formatTimelineDate("not-a-date")).toBe("not-a-date");
  });

  it("returns original string for empty string", () => {
    expect(formatTimelineDate("")).toBe("");
  });
});
