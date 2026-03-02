import { describe, it, expect } from "vitest";

/**
 * 心理区申请页面逻辑测试
 *
 * 验证心理区申请页面的纯函数逻辑：
 * - 申请状态文本
 * - 申请状态颜色
 * - 申请允许逻辑
 *
 * Validates: Requirements 8.6, 35.5
 */

import {
  getApplicationStatusText,
  getApplicationStatusColor,
  isApplicationAllowed,
} from "../page";

/* ---------- Status Text Helper ---------- */

describe("getApplicationStatusText", () => {
  it("returns pending text for 'pending' status", () => {
    const text = getApplicationStatusText("pending");
    expect(text).toBe("您的申请正在审核中，请耐心等待");
  });

  it("returns approved text for 'approved' status", () => {
    const text = getApplicationStatusText("approved");
    expect(text).toBe("您已获得心理交流区访问权限");
  });

  it("returns rejected text for 'rejected' status", () => {
    const text = getApplicationStatusText("rejected");
    expect(text).toContain("未通过审核");
  });

  it("returns hasAccess text for 'hasAccess' status", () => {
    const text = getApplicationStatusText("hasAccess");
    expect(text).toBe("您已拥有心理交流区访问权限");
  });

  it("returns empty string for unknown status", () => {
    expect(getApplicationStatusText("unknown")).toBe("");
    expect(getApplicationStatusText("")).toBe("");
  });
});

/* ---------- Status Color Helper ---------- */

describe("getApplicationStatusColor", () => {
  it("returns amber classes for 'pending' status", () => {
    const color = getApplicationStatusColor("pending");
    expect(color).toContain("amber");
  });

  it("returns green classes for 'approved' status", () => {
    const color = getApplicationStatusColor("approved");
    expect(color).toContain("green");
  });

  it("returns green classes for 'hasAccess' status", () => {
    const color = getApplicationStatusColor("hasAccess");
    expect(color).toContain("green");
  });

  it("returns red classes for 'rejected' status", () => {
    const color = getApplicationStatusColor("rejected");
    expect(color).toContain("red");
  });

  it("returns empty string for unknown status", () => {
    expect(getApplicationStatusColor("unknown")).toBe("");
    expect(getApplicationStatusColor("")).toBe("");
  });
});

/* ---------- Application Allowed Logic ---------- */

describe("isApplicationAllowed", () => {
  it("allows application when user has no access and no pending", () => {
    expect(isApplicationAllowed(false, false)).toBe(true);
  });

  it("disallows application when user already has access", () => {
    expect(isApplicationAllowed(true, false)).toBe(false);
  });

  it("disallows application when user has pending application", () => {
    expect(isApplicationAllowed(false, true)).toBe(false);
  });

  it("disallows application when user has both access and pending", () => {
    expect(isApplicationAllowed(true, true)).toBe(false);
  });
});
