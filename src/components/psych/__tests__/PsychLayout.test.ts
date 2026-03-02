import { describe, it, expect } from "vitest";

/**
 * PsychLayout 纯函数测试
 *
 * 验证心理区布局组件的纯辅助函数逻辑：
 * - 求助热线数据完整性
 * - 安全提示条文本
 * - 心理区路径检测
 *
 * Validates: Requirements 35.1, 35.3, 35.4, 8.8, 8.9
 */

import {
  getCrisisHotlines,
  getSafetyBannerText,
  isPsychZonePath,
} from "../PsychLayout";

/* ---------- Crisis Hotlines ---------- */

describe("getCrisisHotlines", () => {
  it("returns a non-empty array of hotlines", () => {
    const hotlines = getCrisisHotlines();
    expect(hotlines.length).toBeGreaterThan(0);
  });

  it("each hotline has a name and number", () => {
    const hotlines = getCrisisHotlines();
    for (const hotline of hotlines) {
      expect(hotline.name).toBeTruthy();
      expect(hotline.number).toBeTruthy();
    }
  });

  it("includes the national crisis hotline", () => {
    const hotlines = getCrisisHotlines();
    const national = hotlines.find((h) => h.name.includes("全国心理援助热线"));
    expect(national).toBeDefined();
    expect(national!.number).toBe("400-161-9995");
  });

  it("all phone numbers are in valid format", () => {
    const hotlines = getCrisisHotlines();
    for (const hotline of hotlines) {
      // Phone numbers should contain digits and dashes
      expect(hotline.number).toMatch(/^[\d-]+$/);
    }
  });
});

/* ---------- Safety Banner Text ---------- */

describe("getSafetyBannerText", () => {
  it("returns a non-empty string", () => {
    const text = getSafetyBannerText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("mentions safety and professional help", () => {
    const text = getSafetyBannerText();
    expect(text).toContain("安全");
    expect(text).toContain("心理援助热线");
  });

  it("mentions contacting trusted adults", () => {
    const text = getSafetyBannerText();
    expect(text).toContain("可信成人");
  });
});

/* ---------- Psychology Zone Path Detection ---------- */

describe("isPsychZonePath", () => {
  it("returns true for /psych", () => {
    expect(isPsychZonePath("/psych")).toBe(true);
  });

  it("returns true for /psych/ with trailing slash", () => {
    expect(isPsychZonePath("/psych/")).toBe(true);
  });

  it("returns true for /psych/confide", () => {
    expect(isPsychZonePath("/psych/confide")).toBe(true);
  });

  it("returns true for /psych/posts", () => {
    expect(isPsychZonePath("/psych/posts")).toBe(true);
  });

  it("returns true for /apply", () => {
    expect(isPsychZonePath("/apply")).toBe(true);
  });

  it("returns true for /apply/ with trailing slash", () => {
    expect(isPsychZonePath("/apply/")).toBe(true);
  });

  it("returns false for /", () => {
    expect(isPsychZonePath("/")).toBe(false);
  });

  it("returns false for /discover", () => {
    expect(isPsychZonePath("/discover")).toBe(false);
  });

  it("returns false for /psychology (partial match)", () => {
    expect(isPsychZonePath("/psychology")).toBe(false);
  });

  it("returns false for /dcr", () => {
    expect(isPsychZonePath("/dcr")).toBe(false);
  });

  it("returns false for /settings", () => {
    expect(isPsychZonePath("/settings")).toBe(false);
  });
});
