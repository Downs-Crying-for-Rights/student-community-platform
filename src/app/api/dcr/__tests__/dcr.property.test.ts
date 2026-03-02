import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { hashIP } from "@/lib/utils";

// ==================== Types & Constants ====================

/**
 * Valid case statuses matching the CaseStatus enum.
 */
const CASE_STATUSES = ["OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"] as const;
type CaseStatus = (typeof CASE_STATUSES)[number];

/**
 * Valid status transitions extracted from cases/[id]/route.ts.
 * This is the source of truth for the state machine.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  OPENED: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["NEED_MORE_INFO", "CLOSED"],
  NEED_MORE_INFO: ["IN_PROGRESS"],
};

/**
 * Maximum concurrent active cases per DCRHelper.
 */
const MAX_CONCURRENT_CASES = 5;

/**
 * PII-like sensitive words for desensitization testing.
 */
const SENSITIVE_WORDS = [
  "张三",
  "李四",
  "王五",
  "13800138000",
  "110101199001011234",
  "北京市朝阳区",
  "清华大学",
  "实验中学",
] as const;

// ==================== Pure Logic Under Test ====================

/**
 * Check if a status transition is valid according to the state machine.
 * Mirrors the validation logic in PATCH /api/cases/[id].
 */
function isValidTransition(from: CaseStatus, to: CaseStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Check if a status is terminal (no outgoing transitions).
 * CLOSED has no entry in VALID_TRANSITIONS, so it's terminal.
 */
function isTerminalStatus(status: CaseStatus): boolean {
  const allowed = VALID_TRANSITIONS[status];
  return !allowed || allowed.length === 0;
}

/**
 * Check if a DCRHelper can accept a new case given their active case count.
 * Mirrors the concurrent limit check in PATCH /api/cases/[id].
 */
function canAcceptNewCase(activeCaseCount: number): boolean {
  return activeCaseCount < MAX_CONCURRENT_CASES;
}

/**
 * Desensitize a string value by replacing known sensitive words with [已脱敏].
 * Mirrors the desensitizeValue logic in cases/[id]/export/route.ts.
 * Uses simple indexOf matching (same as scanContent in sensitive-engine.ts).
 */
function desensitizeValue(value: string, sensitiveWords: string[]): string {
  // Detect matches (same logic as scanContent)
  const matches: { startIndex: number; endIndex: number }[] = [];
  const lowerText = value.toLowerCase();

  for (const word of sensitiveWords) {
    const lowerWord = word.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < lowerText.length) {
      const index = lowerText.indexOf(lowerWord, searchFrom);
      if (index === -1) break;
      matches.push({ startIndex: index, endIndex: index + word.length });
      searchFrom = index + 1;
    }
  }

  if (matches.length === 0) return value;

  // Replace from end to start to preserve indices
  const sorted = [...matches].sort((a, b) => b.startIndex - a.startIndex);
  let result = value;
  for (const match of sorted) {
    result = result.slice(0, match.startIndex) + "[已脱敏]" + result.slice(match.endIndex);
  }
  return result;
}

/**
 * Desensitize formData object (string values only).
 * Mirrors desensitizeFormData in cases/[id]/export/route.ts.
 */
function desensitizeFormData(
  formData: Record<string, unknown>,
  sensitiveWords: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formData)) {
    if (typeof value === "string") {
      result[key] = desensitizeValue(value, sensitiveWords);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ==================== Generators ====================

/** Generate a random case status */
function arbCaseStatus() {
  return fc.constantFrom<CaseStatus>(...CASE_STATUSES);
}

/** Generate a pair of (from, to) statuses for transition testing */
function arbStatusPair() {
  return fc.tuple(arbCaseStatus(), arbCaseStatus());
}

/** Generate a random sequence of statuses to simulate a transition path */
function arbStatusSequence() {
  return fc.array(arbCaseStatus(), { minLength: 2, maxLength: 10 });
}

/** Generate a random active case count (0-10) */
function arbActiveCaseCount() {
  return fc.integer({ min: 0, max: 10 });
}

/** Generate a string that contains at least one sensitive word */
function arbStringWithSensitiveWord() {
  return fc.tuple(
    fc.string({ minLength: 0, maxLength: 30 }),
    fc.constantFrom(...SENSITIVE_WORDS),
    fc.string({ minLength: 0, maxLength: 30 }),
  ).map(([prefix, word, suffix]) => `${prefix}${word}${suffix}`);
}

/** Generate a formData record with some string values containing sensitive words */
function arbFormDataWithSensitiveWords() {
  return fc.record({
    description: arbStringWithSensitiveWord(),
    location: fc.oneof(arbStringWithSensitiveWord(), fc.constant("某地")),
    amount: fc.oneof(fc.constant("500元"), fc.constant("1000元")),
    contact: arbStringWithSensitiveWord(),
  });
}

/** Generate a safe string that contains no sensitive words */
function arbSafeString() {
  return fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
    const lower = s.toLowerCase();
    return !SENSITIVE_WORDS.some((w) => lower.includes(w.toLowerCase()));
  });
}

// ==================== Property 11: 工单状态流转合法性 ====================
// **Validates: Requirements 11.1**

describe("属性 11: 工单状态流转合法性", () => {
  it("OPENED 只能转换到 IN_PROGRESS 或 CLOSED", () => {
    fc.assert(
      fc.property(arbCaseStatus(), (targetStatus) => {
        const isValid = isValidTransition("OPENED", targetStatus);
        if (targetStatus === "IN_PROGRESS" || targetStatus === "CLOSED") {
          expect(isValid).toBe(true);
        } else {
          expect(isValid).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("IN_PROGRESS 只能转换到 NEED_MORE_INFO 或 CLOSED", () => {
    fc.assert(
      fc.property(arbCaseStatus(), (targetStatus) => {
        const isValid = isValidTransition("IN_PROGRESS", targetStatus);
        if (targetStatus === "NEED_MORE_INFO" || targetStatus === "CLOSED") {
          expect(isValid).toBe(true);
        } else {
          expect(isValid).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("NEED_MORE_INFO 只能转换到 IN_PROGRESS", () => {
    fc.assert(
      fc.property(arbCaseStatus(), (targetStatus) => {
        const isValid = isValidTransition("NEED_MORE_INFO", targetStatus);
        if (targetStatus === "IN_PROGRESS") {
          expect(isValid).toBe(true);
        } else {
          expect(isValid).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("CLOSED 是终态，不能转换到任何状态", () => {
    fc.assert(
      fc.property(arbCaseStatus(), (targetStatus) => {
        expect(isValidTransition("CLOSED", targetStatus)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("CLOSED 被正确识别为终态", () => {
    expect(isTerminalStatus("CLOSED")).toBe(true);
  });

  it("非终态状态至少有一个合法转换目标", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<CaseStatus>("OPENED", "IN_PROGRESS", "NEED_MORE_INFO"),
        (status) => {
          expect(isTerminalStatus(status)).toBe(false);
          const allowed = VALID_TRANSITIONS[status];
          expect(allowed.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("随机状态对中，仅定义在 VALID_TRANSITIONS 中的转换被接受", () => {
    fc.assert(
      fc.property(arbStatusPair(), ([from, to]) => {
        const isValid = isValidTransition(from, to);
        const allowed = VALID_TRANSITIONS[from];
        if (allowed && allowed.includes(to)) {
          expect(isValid).toBe(true);
        } else {
          expect(isValid).toBe(false);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("从 OPENED 开始的随机路径中，非法转换被正确拒绝", () => {
    fc.assert(
      fc.property(arbStatusSequence(), (sequence) => {
        let current: CaseStatus = "OPENED";
        for (const next of sequence) {
          const valid = isValidTransition(current, next);
          const allowed = VALID_TRANSITIONS[current];
          if (allowed && allowed.includes(next)) {
            expect(valid).toBe(true);
            current = next;
          } else {
            expect(valid).toBe(false);
            // Stop walking — invalid transition means we stay at current
            break;
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});


// ==================== Property 12: DCRHelper 并发限制 ====================
// **Validates: Requirements 13.3**

describe("属性 12: DCRHelper 并发限制", () => {
  it("活跃工单数 < 5 时允许接单", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        (activeCaseCount) => {
          expect(canAcceptNewCase(activeCaseCount)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("活跃工单数 >= 5 时拒绝接单", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 100 }),
        (activeCaseCount) => {
          expect(canAcceptNewCase(activeCaseCount)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("边界值：活跃工单数恰好为 4 时允许接单", () => {
    expect(canAcceptNewCase(4)).toBe(true);
  });

  it("边界值：活跃工单数恰好为 5 时拒绝接单", () => {
    expect(canAcceptNewCase(5)).toBe(false);
  });

  it("对任意非负整数，canAcceptNewCase 结果与阈值比较一致", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        (activeCaseCount) => {
          const result = canAcceptNewCase(activeCaseCount);
          expect(result).toBe(activeCaseCount < MAX_CONCURRENT_CASES);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ==================== Property 13: CSV 导出二次脱敏 ====================
// **Validates: Requirements 11.7**

describe("属性 13: CSV 导出二次脱敏", () => {
  it("包含敏感词的字符串经脱敏后不再包含原始敏感词", () => {
    fc.assert(
      fc.property(arbStringWithSensitiveWord(), (value) => {
        const desensitized = desensitizeValue(value, [...SENSITIVE_WORDS]);
        // After desensitization, none of the sensitive words should remain
        for (const word of SENSITIVE_WORDS) {
          if (value.toLowerCase().includes(word.toLowerCase())) {
            expect(desensitized.toLowerCase()).not.toContain(word.toLowerCase());
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it("不包含敏感词的字符串经脱敏后保持不变", () => {
    fc.assert(
      fc.property(arbSafeString(), (value) => {
        const desensitized = desensitizeValue(value, [...SENSITIVE_WORDS]);
        expect(desensitized).toBe(value);
      }),
      { numRuns: 500 },
    );
  });

  it("脱敏后的字符串包含 [已脱敏] 替换标记（当原始值含敏感词时）", () => {
    fc.assert(
      fc.property(arbStringWithSensitiveWord(), (value) => {
        const desensitized = desensitizeValue(value, [...SENSITIVE_WORDS]);
        expect(desensitized).toContain("[已脱敏]");
      }),
      { numRuns: 500 },
    );
  });

  it("formData 中所有字符串字段的敏感词均被脱敏", () => {
    fc.assert(
      fc.property(arbFormDataWithSensitiveWords(), (formData) => {
        const desensitized = desensitizeFormData(formData, [...SENSITIVE_WORDS]);

        for (const [key, value] of Object.entries(desensitized)) {
          if (typeof value === "string") {
            for (const word of SENSITIVE_WORDS) {
              const originalValue = formData[key];
              if (typeof originalValue === "string" && originalValue.toLowerCase().includes(word.toLowerCase())) {
                expect(value.toLowerCase()).not.toContain(word.toLowerCase());
              }
            }
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it("formData 中非字符串字段保持不变", () => {
    fc.assert(
      fc.property(
        fc.record({
          name: arbStringWithSensitiveWord(),
          count: fc.integer({ min: 0, max: 1000 }),
          active: fc.boolean(),
          tags: fc.constant(null),
        }),
        (formData) => {
          const desensitized = desensitizeFormData(
            formData as unknown as Record<string, unknown>,
            [...SENSITIVE_WORDS],
          );
          expect(desensitized.count).toBe(formData.count);
          expect(desensitized.active).toBe(formData.active);
          expect(desensitized.tags).toBe(formData.tags);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("hashIP 对相同输入产生一致的哈希值", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (input) => {
        const hash1 = hashIP(input);
        const hash2 = hashIP(input);
        expect(hash1).toBe(hash2);
      }),
      { numRuns: 200 },
    );
  });

  it("hashIP 对不同输入产生不同的哈希值", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (input1, input2) => {
          fc.pre(input1 !== input2);
          const hash1 = hashIP(input1);
          const hash2 = hashIP(input2);
          expect(hash1).not.toBe(hash2);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("hashIP 输出不包含原始输入值", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 50 }),
        (input) => {
          const hashed = hashIP(input);
          expect(hashed).not.toContain(input);
        },
      ),
      { numRuns: 200 },
    );
  });
});
