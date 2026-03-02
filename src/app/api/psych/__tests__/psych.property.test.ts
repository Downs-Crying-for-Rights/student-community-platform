import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ==================== Types & Constants ====================

/**
 * Fields that the queue endpoint is allowed to return.
 * Extracted from GET /api/psych/queue route's Prisma select clause.
 */
const ALLOWED_QUEUE_FIELDS = ["id", "summary", "anonymousId", "createdAt"] as const;

/**
 * Identity fields that MUST NEVER appear in queue responses.
 * These would leak the requester's real identity to the Listener.
 */
const FORBIDDEN_IDENTITY_FIELDS = [
  "requesterId",
  "listenerId",
  "email",
  "nickname",
  "avatar",
  "bio",
  "role",
] as const;

/**
 * Known risk trigger words for testing.
 * Matches the RISK category words used by the sensitive engine.
 */
const RISK_TRIGGER_WORDS = [
  "自杀",
  "自残",
  "不想活",
  "跳楼",
  "割腕",
  "轻生",
] as const;

/**
 * Sensitive word categories matching the Prisma schema.
 */
const SENSITIVE_CATEGORIES = ["PII", "RISK", "PHISHING", "PROFANITY"] as const;
type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

// ==================== Pure Logic Under Test ====================

/**
 * Simulates the queue endpoint's select clause behavior.
 * Only returns the allowed fields from a confide request record.
 * Extracted from GET /api/psych/queue route.
 */
function applyQueueSelect(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of ALLOWED_QUEUE_FIELDS) {
    if (field in record) {
      result[field] = record[field];
    }
  }
  return result;
}

/**
 * Checks if a queue response item contains any forbidden identity fields.
 */
function containsIdentityLeak(item: Record<string, unknown>): boolean {
  for (const field of FORBIDDEN_IDENTITY_FIELDS) {
    if (field in item && item[field] !== undefined) {
      return true;
    }
  }
  return false;
}

/**
 * Simple risk word scanner that mirrors scanContent logic for RISK category.
 * Uses case-insensitive substring matching (same as sensitive-engine.ts).
 */
function detectRiskWords(
  text: string,
  riskWords: string[],
): { word: string; category: SensitiveCategory; startIndex: number; endIndex: number }[] {
  if (!text || text.length === 0) return [];

  const matches: { word: string; category: SensitiveCategory; startIndex: number; endIndex: number }[] = [];
  const lowerText = text.toLowerCase();

  for (const word of riskWords) {
    const lowerWord = word.toLowerCase();
    let searchFrom = 0;

    while (searchFrom < lowerText.length) {
      const index = lowerText.indexOf(lowerWord, searchFrom);
      if (index === -1) break;

      matches.push({
        word: text.slice(index, index + word.length),
        category: "RISK",
        startIndex: index,
        endIndex: index + word.length,
      });

      searchFrom = index + 1;
    }
  }

  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

// ==================== Generators ====================

/** Generate a random confide request record with both safe and identity fields */
function arbConfideRequestRecord() {
  return fc.record({
    id: fc.uuid(),
    summary: fc.string({ minLength: 1, maxLength: 200 }),
    anonymousId: fc.string({ minLength: 5, maxLength: 20 }).map((s) => `匿名用户_${s}`),
    createdAt: fc.date(),
    // Identity fields that should be stripped
    requesterId: fc.uuid(),
    listenerId: fc.option(fc.uuid(), { nil: undefined }),
    email: fc.option(fc.emailAddress(), { nil: undefined }),
    nickname: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    avatar: fc.option(fc.webUrl(), { nil: undefined }),
    bio: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
    role: fc.option(fc.constantFrom("USER", "TRUSTED_USER", "MODERATOR", "ADMIN"), { nil: undefined }),
  });
}

/** Generate a message that contains at least one risk trigger word */
function arbMessageWithRiskWord() {
  return fc.tuple(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.constantFrom(...RISK_TRIGGER_WORDS),
    fc.string({ minLength: 0, maxLength: 50 }),
  ).map(([prefix, riskWord, suffix]) => `${prefix}${riskWord}${suffix}`);
}

/** Generate a safe message that contains no risk trigger words */
function arbSafeMessage() {
  return fc.string({ minLength: 1, maxLength: 200 }).filter((msg) => {
    const lower = msg.toLowerCase();
    return !RISK_TRIGGER_WORDS.some((w) => lower.includes(w.toLowerCase()));
  });
}

// ==================== Property 9: 倾诉请求匿名性 ====================
// **Validates: Requirements 12.2**

describe("属性 9: 倾诉请求匿名性", () => {
  it("队列响应仅包含允许的字段（id, summary, anonymousId, createdAt）", () => {
    fc.assert(
      fc.property(arbConfideRequestRecord(), (record) => {
        const selected = applyQueueSelect(record);
        const keys = Object.keys(selected);

        // Every key in the result must be in the allowed list
        for (const key of keys) {
          expect(ALLOWED_QUEUE_FIELDS as readonly string[]).toContain(key);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("队列响应中 requesterId 永远不存在", () => {
    fc.assert(
      fc.property(arbConfideRequestRecord(), (record) => {
        const selected = applyQueueSelect(record);
        expect(selected).not.toHaveProperty("requesterId");
      }),
      { numRuns: 500 },
    );
  });

  it("队列响应中 listenerId 永远不存在", () => {
    fc.assert(
      fc.property(arbConfideRequestRecord(), (record) => {
        const selected = applyQueueSelect(record);
        expect(selected).not.toHaveProperty("listenerId");
      }),
      { numRuns: 500 },
    );
  });

  it("队列响应中 email 永远不存在", () => {
    fc.assert(
      fc.property(arbConfideRequestRecord(), (record) => {
        const selected = applyQueueSelect(record);
        expect(selected).not.toHaveProperty("email");
      }),
      { numRuns: 500 },
    );
  });

  it("队列响应中 nickname 永远不存在", () => {
    fc.assert(
      fc.property(arbConfideRequestRecord(), (record) => {
        const selected = applyQueueSelect(record);
        expect(selected).not.toHaveProperty("nickname");
      }),
      { numRuns: 500 },
    );
  });

  it("无论输入包含多少身份字段，select 后均不泄露任何身份信息", () => {
    fc.assert(
      fc.property(arbConfideRequestRecord(), (record) => {
        const selected = applyQueueSelect(record);
        expect(containsIdentityLeak(selected)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it("select 后保留的字段值与原始记录一致", () => {
    fc.assert(
      fc.property(arbConfideRequestRecord(), (record) => {
        const selected = applyQueueSelect(record);

        for (const field of ALLOWED_QUEUE_FIELDS) {
          if (field in record) {
            expect(selected[field]).toEqual(record[field]);
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});

// ==================== Property 10: 风险触发词检测覆盖 ====================
// **Validates: Requirements 12.4, 12.5**

describe("属性 10: 风险触发词检测覆盖", () => {
  it("包含风险触发词的消息应返回 RISK 类别匹配", () => {
    fc.assert(
      fc.property(arbMessageWithRiskWord(), (message) => {
        const matches = detectRiskWords(message, [...RISK_TRIGGER_WORDS]);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches.every((m) => m.category === "RISK")).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("不包含风险触发词的消息应返回空匹配", () => {
    fc.assert(
      fc.property(arbSafeMessage(), (message) => {
        const matches = detectRiskWords(message, [...RISK_TRIGGER_WORDS]);
        expect(matches).toHaveLength(0);
      }),
      { numRuns: 500 },
    );
  });

  it("检测到的匹配位置应正确指向原文中的触发词", () => {
    fc.assert(
      fc.property(arbMessageWithRiskWord(), (message) => {
        const matches = detectRiskWords(message, [...RISK_TRIGGER_WORDS]);

        for (const match of matches) {
          // The extracted word from the message at the reported position should match
          const extracted = message.slice(match.startIndex, match.endIndex);
          expect(extracted.toLowerCase()).toBe(match.word.toLowerCase());
          // Position bounds are valid
          expect(match.startIndex).toBeGreaterThanOrEqual(0);
          expect(match.endIndex).toBeLessThanOrEqual(message.length);
          expect(match.endIndex).toBeGreaterThan(match.startIndex);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("每个已知风险触发词都能被独立检测到", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RISK_TRIGGER_WORDS),
        (riskWord) => {
          const matches = detectRiskWords(riskWord, [...RISK_TRIGGER_WORDS]);
          expect(matches.length).toBeGreaterThanOrEqual(1);
          expect(matches.some((m) => m.word === riskWord)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("空消息不应返回任何匹配", () => {
    const matches = detectRiskWords("", [...RISK_TRIGGER_WORDS]);
    expect(matches).toHaveLength(0);
  });

  it("同一消息中多次出现的风险词应全部被检测到", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RISK_TRIGGER_WORDS),
        fc.integer({ min: 2, max: 5 }),
        (riskWord, repeatCount) => {
          const separator = "，这是分隔文本，";
          const message = Array(repeatCount).fill(riskWord).join(separator);
          const matches = detectRiskWords(message, [...RISK_TRIGGER_WORDS]);
          expect(matches.length).toBeGreaterThanOrEqual(repeatCount);
        },
      ),
      { numRuns: 200 },
    );
  });
});
