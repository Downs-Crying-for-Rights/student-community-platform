import { describe, it, expect } from "vitest";

/**
 * WizardStepper 向导步骤器组件逻辑测试
 *
 * 验证步骤状态计算和进度百分比计算的纯函数逻辑。
 *
 * Validates: Requirements 10.1, 36.3
 */

import { getStepStatus, getProgressPercent } from "../WizardStepper";

/* ---------- getStepStatus ---------- */

describe("getStepStatus", () => {
  it("returns 'completed' for steps before currentStep", () => {
    expect(getStepStatus(0, 2)).toBe("completed");
    expect(getStepStatus(1, 2)).toBe("completed");
  });

  it("returns 'current' for the currentStep", () => {
    expect(getStepStatus(0, 0)).toBe("current");
    expect(getStepStatus(2, 2)).toBe("current");
  });

  it("returns 'upcoming' for steps after currentStep", () => {
    expect(getStepStatus(3, 1)).toBe("upcoming");
    expect(getStepStatus(2, 0)).toBe("upcoming");
  });

  it("handles first step as current correctly", () => {
    expect(getStepStatus(0, 0)).toBe("current");
    expect(getStepStatus(1, 0)).toBe("upcoming");
  });

  it("handles last step as current correctly", () => {
    expect(getStepStatus(3, 3)).toBe("current");
    expect(getStepStatus(2, 3)).toBe("completed");
  });
});

/* ---------- getProgressPercent ---------- */

describe("getProgressPercent", () => {
  it("returns 0 for first step of multi-step wizard", () => {
    expect(getProgressPercent(0, 4)).toBe(0);
  });

  it("returns 100 for last step", () => {
    expect(getProgressPercent(3, 4)).toBe(100);
  });

  it("returns intermediate values for middle steps", () => {
    expect(getProgressPercent(1, 4)).toBe(33);
    expect(getProgressPercent(2, 4)).toBe(67);
  });

  it("returns 100 for single-step wizard", () => {
    expect(getProgressPercent(0, 1)).toBe(100);
  });

  it("clamps to 0-100 range", () => {
    expect(getProgressPercent(-1, 4)).toBe(0);
    expect(getProgressPercent(10, 4)).toBe(100);
  });

  it("returns 50 for step 1 of 3", () => {
    expect(getProgressPercent(1, 3)).toBe(50);
  });
});
