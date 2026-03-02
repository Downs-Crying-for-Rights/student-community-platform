import { describe, it, expect } from "vitest";

/**
 * DCR UI 纯函数单元测试
 *
 * 验证工单操作按钮映射、消息发送守卫、时间格式化、消息归属判断、工单计数格式。
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.9, 2.1, 2.5, 2.6, 2.8, 2.9, 4.7
 */

import {
  getAvailableActions,
  canSendMessage,
  formatMessageTime,
  isOwnMessage,
  formatHelperCaseCount,
  type CaseStatus,
} from "../dcr-ui-helpers";

/* ---------- getAvailableActions ---------- */

describe("getAvailableActions", () => {
  it("OPENED + DCR_HELPER → 接单", () => {
    const actions = getAvailableActions("OPENED", "DCR_HELPER", false, false);
    expect(actions).toEqual([
      { label: "接单", targetStatus: "IN_PROGRESS", variant: "default" },
    ]);
  });

  it("OPENED + ADMIN → 接单", () => {
    const actions = getAvailableActions("OPENED", "ADMIN", false, false);
    expect(actions).toEqual([
      { label: "接单", targetStatus: "IN_PROGRESS", variant: "default" },
    ]);
  });

  it("OPENED + 提交者 → 取消工单", () => {
    const actions = getAvailableActions("OPENED", "USER", true, false);
    expect(actions).toEqual([
      { label: "取消工单", targetStatus: "CLOSED", variant: "destructive" },
    ]);
  });

  it("OPENED + ADMIN 且为提交者 → 接单 + 取消工单", () => {
    const actions = getAvailableActions("OPENED", "ADMIN", true, false);
    expect(actions).toHaveLength(2);
    expect(actions[0].label).toBe("接单");
    expect(actions[1].label).toBe("取消工单");
  });

  it("OPENED + 普通用户（非提交者）→ 空", () => {
    const actions = getAvailableActions("OPENED", "USER", false, false);
    expect(actions).toEqual([]);
  });

  it("IN_PROGRESS + 处理者 → 请求补充 + 关闭工单", () => {
    const actions = getAvailableActions("IN_PROGRESS", "DCR_HELPER", false, true);
    expect(actions).toEqual([
      { label: "请求补充", targetStatus: "NEED_MORE_INFO", variant: "outline" },
      { label: "关闭工单", targetStatus: "CLOSED", variant: "destructive" },
    ]);
  });

  it("IN_PROGRESS + ADMIN → 请求补充 + 关闭工单", () => {
    const actions = getAvailableActions("IN_PROGRESS", "ADMIN", false, false);
    expect(actions).toEqual([
      { label: "请求补充", targetStatus: "NEED_MORE_INFO", variant: "outline" },
      { label: "关闭工单", targetStatus: "CLOSED", variant: "destructive" },
    ]);
  });

  it("IN_PROGRESS + 提交者（非处理者）→ 空", () => {
    const actions = getAvailableActions("IN_PROGRESS", "USER", true, false);
    expect(actions).toEqual([]);
  });

  it("NEED_MORE_INFO + 提交者 → 已补充信息", () => {
    const actions = getAvailableActions("NEED_MORE_INFO", "USER", true, false);
    expect(actions).toEqual([
      { label: "已补充信息", targetStatus: "IN_PROGRESS", variant: "default" },
    ]);
  });

  it("NEED_MORE_INFO + ADMIN → 已补充信息", () => {
    const actions = getAvailableActions("NEED_MORE_INFO", "ADMIN", false, false);
    expect(actions).toEqual([
      { label: "已补充信息", targetStatus: "IN_PROGRESS", variant: "default" },
    ]);
  });

  it("NEED_MORE_INFO + 处理者（非提交者）→ 空", () => {
    const actions = getAvailableActions("NEED_MORE_INFO", "DCR_HELPER", false, true);
    expect(actions).toEqual([]);
  });

  it("OPENED + SUPER_ADMIN → 接单", () => {
    const actions = getAvailableActions("OPENED", "SUPER_ADMIN", false, false);
    expect(actions).toEqual([
      { label: "接单", targetStatus: "IN_PROGRESS", variant: "default" },
    ]);
  });

  it("IN_PROGRESS + SUPER_ADMIN → 请求补充 + 关闭工单", () => {
    const actions = getAvailableActions("IN_PROGRESS", "SUPER_ADMIN", false, false);
    expect(actions).toEqual([
      { label: "请求补充", targetStatus: "NEED_MORE_INFO", variant: "outline" },
      { label: "关闭工单", targetStatus: "CLOSED", variant: "destructive" },
    ]);
  });

  it("NEED_MORE_INFO + SUPER_ADMIN → 已补充信息", () => {
    const actions = getAvailableActions("NEED_MORE_INFO", "SUPER_ADMIN", false, false);
    expect(actions).toEqual([
      { label: "已补充信息", targetStatus: "IN_PROGRESS", variant: "default" },
    ]);
  });

  it("CLOSED → 空（任何角色）", () => {
    expect(getAvailableActions("CLOSED", "ADMIN", true, true)).toEqual([]);
    expect(getAvailableActions("CLOSED", "SUPER_ADMIN", true, true)).toEqual([]);
    expect(getAvailableActions("CLOSED", "DCR_HELPER", false, true)).toEqual([]);
    expect(getAvailableActions("CLOSED", "USER", true, false)).toEqual([]);
  });
});

/* ---------- canSendMessage ---------- */

describe("canSendMessage", () => {
  it("IN_PROGRESS → true", () => {
    expect(canSendMessage("IN_PROGRESS")).toBe(true);
  });

  it("NEED_MORE_INFO → true", () => {
    expect(canSendMessage("NEED_MORE_INFO")).toBe(true);
  });

  it("OPENED without isSubmitter → false", () => {
    expect(canSendMessage("OPENED")).toBe(false);
  });

  it("OPENED with isSubmitter=false → false", () => {
    expect(canSendMessage("OPENED", false)).toBe(false);
  });

  it("OPENED with isSubmitter=true → true (submitter can supplement info)", () => {
    expect(canSendMessage("OPENED", true)).toBe(true);
  });

  it("CLOSED → false", () => {
    expect(canSendMessage("CLOSED")).toBe(false);
  });

  it("CLOSED with isSubmitter=true → false (CLOSED always blocks)", () => {
    expect(canSendMessage("CLOSED", true)).toBe(false);
  });

  it("IN_PROGRESS ignores isSubmitter (always true)", () => {
    expect(canSendMessage("IN_PROGRESS", false)).toBe(true);
    expect(canSendMessage("IN_PROGRESS", true)).toBe(true);
  });

  it("NEED_MORE_INFO ignores isSubmitter (always true)", () => {
    expect(canSendMessage("NEED_MORE_INFO", false)).toBe(true);
    expect(canSendMessage("NEED_MORE_INFO", true)).toBe(true);
  });
});

/* ---------- formatMessageTime ---------- */

describe("formatMessageTime", () => {
  it("formats ISO date to MM-DD HH:mm", () => {
    // Use a fixed UTC date and check the local formatted output
    const result = formatMessageTime("2024-03-15T08:30:00.000Z");
    expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("returns original string for invalid date", () => {
    expect(formatMessageTime("not-a-date")).toBe("not-a-date");
  });

  it("returns original string for empty string", () => {
    expect(formatMessageTime("")).toBe("");
  });
});

/* ---------- isOwnMessage ---------- */

describe("isOwnMessage", () => {
  it("returns true when IDs match", () => {
    expect(isOwnMessage("user-1", "user-1")).toBe(true);
  });

  it("returns false when IDs differ", () => {
    expect(isOwnMessage("user-1", "user-2")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(isOwnMessage("", "user-1")).toBe(false);
  });
});

/* ---------- formatHelperCaseCount ---------- */

describe("formatHelperCaseCount", () => {
  it("formats 0/5", () => {
    expect(formatHelperCaseCount(0, 5)).toBe("0/5");
  });

  it("formats 3/5", () => {
    expect(formatHelperCaseCount(3, 5)).toBe("3/5");
  });

  it("formats 5/5", () => {
    expect(formatHelperCaseCount(5, 5)).toBe("5/5");
  });
});
