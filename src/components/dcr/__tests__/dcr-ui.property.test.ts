import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  getAvailableActions,
  canSendMessage,
  formatMessageTime,
  isOwnMessage,
  formatHelperCaseCount,
  type CaseStatus,
  type ActionConfig,
} from "@/lib/dcr-ui-helpers";

// ==================== Types & Constants ====================

const CASE_STATUSES: CaseStatus[] = ["OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"];

const ALL_ROLES = ["USER", "TRUSTED_USER", "MODERATOR", "ADMIN", "DCR_HELPER"] as const;

// ==================== Generators ====================

function arbCaseStatus() {
  return fc.constantFrom<CaseStatus>(...CASE_STATUSES);
}

function arbRole() {
  return fc.constantFrom<string>(...ALL_ROLES);
}

/** Generate a valid ISO date string within a reasonable range */
function arbISODate() {
  // Generate dates between 2020-01-01 and 2030-12-31
  return fc
    .integer({ min: 1577836800000, max: 1924991999000 })
    .map((ts) => new Date(ts).toISOString());
}

/** Generate a non-empty string for user IDs */
function arbUserId() {
  return fc.stringMatching(/^[a-z0-9]{1,20}$/);
}

/** Generate a non-negative integer */
function arbNonNegInt() {
  return fc.nat({ max: 1000 });
}

// ==================== Property 1: 操作按钮与状态/角色的映射正确性 ====================
// Feature: dcr-complete-ui, Property 1: 操作按钮与状态/角色的映射正确性
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.9**

describe("Property 1: 操作按钮与状态/角色的映射正确性", () => {
  it("OPENED + DCR_HELPER/ADMIN → 包含「接单」按钮", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("DCR_HELPER", "ADMIN"),
        fc.boolean(),
        fc.boolean(),
        (role, isSubmitter, isHandler) => {
          const actions = getAvailableActions("OPENED", role, isSubmitter, isHandler);
          const labels = actions.map((a) => a.label);
          expect(labels).toContain("接单");
          const accept = actions.find((a) => a.label === "接单")!;
          expect(accept.targetStatus).toBe("IN_PROGRESS");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("OPENED + 提交者 → 包含「取消工单」按钮", () => {
    fc.assert(
      fc.property(arbRole(), fc.boolean(), (role, isHandler) => {
        const actions = getAvailableActions("OPENED", role, true, isHandler);
        const labels = actions.map((a) => a.label);
        expect(labels).toContain("取消工单");
        const cancel = actions.find((a) => a.label === "取消工单")!;
        expect(cancel.targetStatus).toBe("CLOSED");
      }),
      { numRuns: 100 },
    );
  });

  it("IN_PROGRESS + 处理者/ADMIN → 包含「请求补充」和「关闭工单」", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("DCR_HELPER", "ADMIN", "USER", "TRUSTED_USER", "MODERATOR"),
        fc.boolean(),
        (role, isSubmitter) => {
          // Only handler or ADMIN should see these buttons
          const isHandler = true;
          const actions = getAvailableActions("IN_PROGRESS", role, isSubmitter, isHandler);
          const labels = actions.map((a) => a.label);
          expect(labels).toContain("请求补充");
          expect(labels).toContain("关闭工单");

          const reqMore = actions.find((a) => a.label === "请求补充")!;
          expect(reqMore.targetStatus).toBe("NEED_MORE_INFO");

          const close = actions.find((a) => a.label === "关闭工单")!;
          expect(close.targetStatus).toBe("CLOSED");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("IN_PROGRESS + ADMIN（非处理者）→ 包含「请求补充」和「关闭工单」", () => {
    fc.assert(
      fc.property(fc.boolean(), (isSubmitter) => {
        const actions = getAvailableActions("IN_PROGRESS", "ADMIN", isSubmitter, false);
        const labels = actions.map((a) => a.label);
        expect(labels).toContain("请求补充");
        expect(labels).toContain("关闭工单");
      }),
      { numRuns: 100 },
    );
  });

  it("NEED_MORE_INFO + 提交者/ADMIN → 包含「已补充信息」", () => {
    fc.assert(
      fc.property(
        arbRole(),
        fc.boolean(),
        (role, isHandler) => {
          // Test as submitter
          const actions = getAvailableActions("NEED_MORE_INFO", role, true, isHandler);
          const labels = actions.map((a) => a.label);
          expect(labels).toContain("已补充信息");
          const info = actions.find((a) => a.label === "已补充信息")!;
          expect(info.targetStatus).toBe("IN_PROGRESS");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("NEED_MORE_INFO + ADMIN（非提交者）→ 包含「已补充信息」", () => {
    fc.assert(
      fc.property(fc.boolean(), (isHandler) => {
        const actions = getAvailableActions("NEED_MORE_INFO", "ADMIN", false, isHandler);
        const labels = actions.map((a) => a.label);
        expect(labels).toContain("已补充信息");
      }),
      { numRuns: 100 },
    );
  });

  it("CLOSED → 空集合（任何角色/身份组合）", () => {
    fc.assert(
      fc.property(
        arbRole(),
        fc.boolean(),
        fc.boolean(),
        (role, isSubmitter, isHandler) => {
          const actions = getAvailableActions("CLOSED", role, isSubmitter, isHandler);
          expect(actions).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("IN_PROGRESS + 非处理者且非 ADMIN → 空集合", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("USER", "TRUSTED_USER", "MODERATOR", "DCR_HELPER"),
        fc.boolean(),
        (role, isSubmitter) => {
          const actions = getAvailableActions("IN_PROGRESS", role, isSubmitter, false);
          expect(actions).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("NEED_MORE_INFO + 非提交者且非 ADMIN → 空集合", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("USER", "TRUSTED_USER", "MODERATOR", "DCR_HELPER"),
        fc.boolean(),
        (role, isHandler) => {
          const actions = getAvailableActions("NEED_MORE_INFO", role, false, isHandler);
          expect(actions).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 2: 消息发送状态守卫 ====================
// Feature: dcr-complete-ui, Property 2: 消息发送状态守卫
// **Validates: Requirements 2.1, 2.8**

describe("Property 2: 消息发送状态守卫", () => {
  it("canSendMessage 仅在 IN_PROGRESS/NEED_MORE_INFO 返回 true", () => {
    fc.assert(
      fc.property(arbCaseStatus(), (status) => {
        const result = canSendMessage(status);
        if (status === "IN_PROGRESS" || status === "NEED_MORE_INFO") {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("OPENED 和 CLOSED 状态始终返回 false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<CaseStatus>("OPENED", "CLOSED"),
        (status) => {
          expect(canSendMessage(status)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("IN_PROGRESS 和 NEED_MORE_INFO 状态始终返回 true", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<CaseStatus>("IN_PROGRESS", "NEED_MORE_INFO"),
        (status) => {
          expect(canSendMessage(status)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 3: 消息时间格式化 ====================
// Feature: dcr-complete-ui, Property 3: 消息时间格式化
// **Validates: Requirements 2.9**

describe("Property 3: 消息时间格式化", () => {
  it("有效 ISO 日期字符串输出匹配 MM-DD HH:mm 格式", () => {
    fc.assert(
      fc.property(arbISODate(), (dateStr) => {
        const result = formatMessageTime(dateStr);
        expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
      }),
      { numRuns: 100 },
    );
  });

  it("月份部分在 01-12 范围内", () => {
    fc.assert(
      fc.property(arbISODate(), (dateStr) => {
        const result = formatMessageTime(dateStr);
        const month = parseInt(result.slice(0, 2), 10);
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
      }),
      { numRuns: 100 },
    );
  });

  it("日期部分在 01-31 范围内", () => {
    fc.assert(
      fc.property(arbISODate(), (dateStr) => {
        const result = formatMessageTime(dateStr);
        const day = parseInt(result.slice(3, 5), 10);
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(31);
      }),
      { numRuns: 100 },
    );
  });

  it("小时部分在 00-23 范围内", () => {
    fc.assert(
      fc.property(arbISODate(), (dateStr) => {
        const result = formatMessageTime(dateStr);
        const hours = parseInt(result.slice(6, 8), 10);
        expect(hours).toBeGreaterThanOrEqual(0);
        expect(hours).toBeLessThanOrEqual(23);
      }),
      { numRuns: 100 },
    );
  });

  it("分钟部分在 00-59 范围内", () => {
    fc.assert(
      fc.property(arbISODate(), (dateStr) => {
        const result = formatMessageTime(dateStr);
        const minutes = parseInt(result.slice(9, 11), 10);
        expect(minutes).toBeGreaterThanOrEqual(0);
        expect(minutes).toBeLessThanOrEqual(59);
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 4: 消息归属判断 ====================
// Feature: dcr-complete-ui, Property 4: 消息归属判断
// **Validates: Requirements 2.6**

describe("Property 4: 消息归属判断", () => {
  it("senderId === currentUserId 时返回 true", () => {
    fc.assert(
      fc.property(arbUserId(), (userId) => {
        expect(isOwnMessage(userId, userId)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("senderId !== currentUserId 时返回 false", () => {
    fc.assert(
      fc.property(arbUserId(), arbUserId(), (senderId, currentUserId) => {
        fc.pre(senderId !== currentUserId);
        expect(isOwnMessage(senderId, currentUserId)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("isOwnMessage 结果与严格相等一致", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        fc.string({ minLength: 0, maxLength: 30 }),
        (senderId, currentUserId) => {
          expect(isOwnMessage(senderId, currentUserId)).toBe(senderId === currentUserId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 11: Helper 工单计数格式 ====================
// Feature: dcr-complete-ui, Property 11: Helper 工单计数格式
// **Validates: Requirements 4.7**

describe("Property 11: Helper 工单计数格式", () => {
  it("formatHelperCaseCount(N, 5) 返回 'N/5'", () => {
    fc.assert(
      fc.property(arbNonNegInt(), (n) => {
        const result = formatHelperCaseCount(n, 5);
        expect(result).toBe(`${n}/5`);
      }),
      { numRuns: 100 },
    );
  });

  it("formatHelperCaseCount(N, M) 返回 'N/M' 格式", () => {
    fc.assert(
      fc.property(arbNonNegInt(), arbNonNegInt(), (active, max) => {
        const result = formatHelperCaseCount(active, max);
        expect(result).toBe(`${active}/${max}`);
      }),
      { numRuns: 100 },
    );
  });

  it("输出格式匹配 'number/number' 模式", () => {
    fc.assert(
      fc.property(arbNonNegInt(), arbNonNegInt(), (active, max) => {
        const result = formatHelperCaseCount(active, max);
        expect(result).toMatch(/^\d+\/\d+$/);
      }),
      { numRuns: 100 },
    );
  });
});
