import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { SensitiveWordCategory } from "@prisma/client";

// ==================== Mocks ====================

const redisStore = vi.hoisted(() => new Map<string, string>());

vi.mock("../prisma", () => ({
  default: {
    sensitiveWord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({
        id: "audit-1",
        operatorId: "op-1",
        action: "TEST",
        targetType: "USER",
        targetId: "t-1",
        details: null,
        ipHash: null,
        createdAt: new Date(),
      }),
    },
  },
}));

vi.mock("../redis", () => ({
  default: {
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
  },
}));

import { scanContent, highlightSensitive, type SensitiveMatch } from "../sensitive-engine";
import * as auditModule from "../audit";

beforeEach(() => {
  redisStore.clear();
  vi.clearAllMocks();
});

// ==================== Generators ====================

const ALL_CATEGORIES: SensitiveWordCategory[] = ["PII", "RISK", "PHISHING", "PROFANITY"];

const arbCategory = fc.constantFrom<SensitiveWordCategory>(...ALL_CATEGORIES);

/** Generate a non-empty sensitive word (Chinese chars, 2-6 chars) */
const arbSensitiveWord = fc
  .array(
    fc.integer({ min: 0x4e00, max: 0x9fff }).map((c) => String.fromCharCode(c)),
    { minLength: 2, maxLength: 6 },
  )
  .map((chars) => chars.join(""));

// ==================== Property 3: 敏感词检测完整性 ====================
// **Validates: Requirements 15.5**

describe("属性 3: 敏感词检测完整性", () => {
  it("对于任意已注册敏感词嵌入随机文本中，scanContent 应检测到该敏感词", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSensitiveWord,
        arbCategory,
        fc.integer({ min: 0x4e00, max: 0x9fff })
          .map((c) => String.fromCharCode(c)),
        async (word, category, padChar) => {
          // Build surrounding text from padChar to guarantee no accidental match
          const prefix = padChar.repeat(fc.sample(fc.integer({ min: 0, max: 10 }), 1)[0]);
          const suffix = padChar.repeat(fc.sample(fc.integer({ min: 0, max: 10 }), 1)[0]);

          // Seed the cache with this single sensitive word
          const entries = [{ word, category }];
          redisStore.set("sensitive-words:all", JSON.stringify(entries));

          const text = prefix + word + suffix;
          const matches = await scanContent(text);

          // The registered word must be detected at least once
          const found = matches.some(
            (m) => m.word.toLowerCase() === word.toLowerCase() && m.category === category,
          );
          expect(found).toBe(true);

          // Clean up for next iteration
          redisStore.clear();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("对于任意已注册敏感词，检测到的位置信息应正确", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSensitiveWord,
        arbCategory,
        fc.integer({ min: 0, max: 15 }),
        async (word, category, prefixLen) => {
          const prefix = "安".repeat(prefixLen);
          const suffix = "好";

          const entries = [{ word, category }];
          redisStore.set("sensitive-words:all", JSON.stringify(entries));

          const text = prefix + word + suffix;
          const matches = await scanContent(text);

          expect(matches.length).toBeGreaterThanOrEqual(1);

          const match = matches.find(
            (m) => m.word.toLowerCase() === word.toLowerCase(),
          );
          expect(match).toBeDefined();
          expect(match!.startIndex).toBe(prefixLen);
          expect(match!.endIndex).toBe(prefixLen + word.length);

          redisStore.clear();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("对于多个已注册敏感词同时出现在文本中，所有敏感词均应被检测到", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(arbSensitiveWord, arbCategory),
          { minLength: 2, maxLength: 5 },
        ),
        async (wordPairs) => {
          // Deduplicate words to avoid overlapping issues
          const uniqueWords = new Map<string, SensitiveWordCategory>();
          for (const [w, c] of wordPairs) {
            uniqueWords.set(w.toLowerCase(), c);
          }
          if (uniqueWords.size < 2) return; // skip if dedup reduced to < 2

          const entries = Array.from(uniqueWords.entries()).map(([w, c]) => ({
            word: w,
            category: c,
          }));
          redisStore.set("sensitive-words:all", JSON.stringify(entries));

          // Build text with separator to avoid overlapping
          const separator = "。";
          const text = entries.map((e) => e.word).join(separator);
          const matches = await scanContent(text);

          // Each registered word should be found
          for (const entry of entries) {
            const found = matches.some(
              (m) => m.word.toLowerCase() === entry.word.toLowerCase(),
            );
            expect(found).toBe(true);
          }

          redisStore.clear();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ==================== Property 4: 审计日志不可篡改性 ====================
// **Validates: Requirements 16.3**

describe("属性 4: 审计日志不可篡改性", () => {
  it("审计模块仅暴露 logAudit 函数（创建操作），不暴露 update/delete 函数", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(auditModule)),
        (exportName) => {
          // The module should not export any function with update/delete semantics
          const lowerName = exportName.toLowerCase();
          const isMutationFn =
            lowerName.includes("update") ||
            lowerName.includes("delete") ||
            lowerName.includes("remove") ||
            lowerName.includes("edit") ||
            lowerName.includes("modify") ||
            lowerName.includes("patch");

          expect(isMutationFn).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("logAudit 仅调用 prisma.auditLog.create，不调用 update/delete/upsert", async () => {
    const prisma = (await import("../prisma")).default;

    // Attach spies for mutation methods that should NOT exist or be called
    const updateSpy = vi.fn();
    const deleteSpy = vi.fn();
    const upsertSpy = vi.fn();
    const deleteManySpy = vi.fn();
    const updateManySpy = vi.fn();

    (prisma.auditLog as Record<string, unknown>).update = updateSpy;
    (prisma.auditLog as Record<string, unknown>).delete = deleteSpy;
    (prisma.auditLog as Record<string, unknown>).upsert = upsertSpy;
    (prisma.auditLog as Record<string, unknown>).deleteMany = deleteManySpy;
    (prisma.auditLog as Record<string, unknown>).updateMany = updateManySpy;

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom(...Object.values(auditModule.AuditAction)),
        fc.constantFrom(...Object.values(auditModule.AuditTargetType)),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (operatorId, action, targetType, targetId) => {
          vi.clearAllMocks();

          await auditModule.logAudit(operatorId, action, targetType, targetId);

          // create should have been called
          expect(prisma.auditLog.create).toHaveBeenCalledOnce();

          // No mutation methods should have been called
          expect(updateSpy).not.toHaveBeenCalled();
          expect(deleteSpy).not.toHaveBeenCalled();
          expect(upsertSpy).not.toHaveBeenCalled();
          expect(deleteManySpy).not.toHaveBeenCalled();
          expect(updateManySpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("logAudit 传递的数据结构应包含所有必需审计字段", async () => {
    const prisma = (await import("../prisma")).default;

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom(...Object.values(auditModule.AuditAction)),
        fc.constantFrom(...Object.values(auditModule.AuditTargetType)),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (operatorId, action, targetType, targetId) => {
          vi.clearAllMocks();

          await auditModule.logAudit(operatorId, action, targetType, targetId);

          const callArgs = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
          const data = callArgs.data;

          // All required fields must be present
          expect(data).toHaveProperty("operatorId", operatorId);
          expect(data).toHaveProperty("action", action);
          expect(data).toHaveProperty("targetType", targetType);
          expect(data).toHaveProperty("targetId", targetId);
        },
      ),
      { numRuns: 50 },
    );
  });
});
