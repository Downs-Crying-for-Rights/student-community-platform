import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { escapeCsvField, sanitizeFormData } from "@/lib/csv-helpers";
import type { SensitiveMatch } from "@/lib/sensitive-engine";
import { NextRequest } from "next/server";

// ==================== Mocks (for API route tests) ====================

const mockCaseFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    case: { findUnique: (...args: unknown[]) => mockCaseFindUnique(...args) },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  AuditAction: { CASE_EXPORT: "CASE_EXPORT" },
  AuditTargetType: { CASE: "CASE" },
}));

vi.mock("@/lib/sensitive-engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/sensitive-engine")>();
  return {
    ...original,
    scanContent: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/lib/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...original,
    hashIP: (val: string) => `hashed_${val}`,
  };
});

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Generators ====================

/** Generate strings that contain at least one CSV-special character (comma, double quote, or newline) */
function arbStringWithSpecialChars() {
  return fc
    .tuple(
      fc.string({ minLength: 0, maxLength: 20 }),
      fc.constantFrom(",", '"', "\n", "\r"),
      fc.string({ minLength: 0, maxLength: 20 }),
    )
    .map(([before, special, after]) => before + special + after);
}

/** Generate arbitrary strings (may or may not contain special chars) */
function arbAnyString() {
  return fc.string({ minLength: 0, maxLength: 50 });
}

/** Generate a non-empty word to use as a sensitive match */
function arbSensitiveWord() {
  return fc.stringMatching(/^[\u4e00-\u9fa5a-zA-Z]{1,6}$/);
}

/** Generate a simple formData record with 1-5 fields */
function arbFormData() {
  return fc.dictionary(
    fc.stringMatching(/^[a-z]{1,8}$/),
    fc.string({ minLength: 1, maxLength: 40 }),
    { minKeys: 1, maxKeys: 5 },
  );
}

/**
 * Generate formData that contains the given sensitive word in at least one value.
 * Returns { formData, word, matches }.
 */
function arbFormDataWithSensitiveWord() {
  return fc
    .tuple(
      fc.stringMatching(/^[a-z]{1,8}$/),
      fc.string({ minLength: 0, maxLength: 15 }),
      arbSensitiveWord(),
      fc.string({ minLength: 0, maxLength: 15 }),
    )
    .map(([key, prefix, word, suffix]) => {
      const value = prefix + word + suffix;
      const formData: Record<string, string> = { [key]: value };
      const match: SensitiveMatch = {
        word,
        category: "PII" as SensitiveMatch["category"],
        startIndex: prefix.length,
        endIndex: prefix.length + word.length,
      };
      return { formData, word, matches: [match] as SensitiveMatch[] };
    });
}

/** Non-ADMIN roles that should get 403 on the export route */
const nonAdminRoles = ["USER", "TRUSTED_USER", "DCR_HELPER", "MODERATOR"] as const;

// ==================== Helpers ====================

/** Parse a CSV field back to its original value (reverse of escapeCsvField) */
function parseCsvField(escaped: string): string {
  if (escaped.startsWith('"') && escaped.endsWith('"')) {
    // Remove surrounding quotes and unescape internal double quotes
    return escaped.slice(1, -1).replace(/""/g, '"');
  }
  return escaped;
}

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/cases/${id}/export`, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) } as never);

// ==================== Property 14: CSV 字段转义 ====================
// Feature: dcr-complete-ui, Property 14: CSV 字段转义
// **Validates: Requirements 5.6**

describe("Property 14: CSV 字段转义", () => {
  it("含特殊字符的字符串输出被双引号包裹", () => {
    fc.assert(
      fc.property(arbStringWithSpecialChars(), (input) => {
        const result = escapeCsvField(input);
        expect(result.startsWith('"')).toBe(true);
        expect(result.endsWith('"')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("内部双引号被转义为两个双引号", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 0, maxLength: 20 }),
          fc.string({ minLength: 0, maxLength: 20 }),
        ),
        ([before, after]) => {
          const input = before + '"' + after;
          const result = escapeCsvField(input);
          // The result should be wrapped in quotes
          expect(result.startsWith('"')).toBe(true);
          expect(result.endsWith('"')).toBe(true);
          // The inner content (without outer quotes) should have "" for each original "
          const inner = result.slice(1, -1);
          // Count of "" in inner should equal count of " in input
          const originalQuotes = (input.match(/"/g) || []).length;
          const escapedQuotes = (inner.match(/""/g) || []).length;
          expect(escapedQuotes).toBe(originalQuotes);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("转义后的字段可以解析回原始值（往返一致性）", () => {
    fc.assert(
      fc.property(arbAnyString(), (input) => {
        const escaped = escapeCsvField(input);
        const parsed = parseCsvField(escaped);
        expect(parsed).toBe(input);
      }),
      { numRuns: 100 },
    );
  });

  it("不含特殊字符的字符串不被双引号包裹", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }).filter(
          (s) => !s.includes(",") && !s.includes('"') && !s.includes("\n") && !s.includes("\r"),
        ),
        (input) => {
          const result = escapeCsvField(input);
          // No special chars → output should equal input (no wrapping)
          expect(result).toBe(input);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 13: CSV 导出数据脱敏 ====================
// Feature: dcr-complete-ui, Property 13: CSV 导出数据脱敏
// **Validates: Requirements 5.7, 5.8**

describe("Property 13: CSV 导出数据脱敏", () => {
  it("所有敏感词在 formData 值中被替换为 [已脱敏]", () => {
    fc.assert(
      fc.property(arbFormDataWithSensitiveWord(), ({ formData, word, matches }) => {
        const result = sanitizeFormData(formData, matches);
        // The sensitive word should not appear in any result value
        for (const value of Object.values(result)) {
          expect(value).not.toContain(word);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("脱敏后的值包含 [已脱敏] 标记", () => {
    fc.assert(
      fc.property(arbFormDataWithSensitiveWord(), ({ formData: _formData, matches }) => {
        const result = sanitizeFormData(_formData, matches);
        // At least one value should contain the redaction marker
        const hasMarker = Object.values(result).some((v) => v.includes("[已脱敏]"));
        expect(hasMarker).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("无匹配时值保持不变", () => {
    fc.assert(
      fc.property(arbFormData(), (formData) => {
        const result = sanitizeFormData(formData, []);
        expect(result).toEqual(formData);
      }),
      { numRuns: 100 },
    );
  });

  it("返回新对象（不是同一引用）", () => {
    fc.assert(
      fc.property(arbFormData(), (formData) => {
        const result = sanitizeFormData(formData, []);
        expect(result).not.toBe(formData);
      }),
      { numRuns: 100 },
    );
  });

  it("不含敏感词的字段值保持不变", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.stringMatching(/^[a-z]{1,8}$/),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.stringMatching(/^[a-z]{1,8}$/),
          fc.string({ minLength: 1, maxLength: 20 }),
          arbSensitiveWord(),
        ),
        ([key1, val1, key2, val2, word]) => {
          // Ensure val1 does not contain the sensitive word
          fc.pre(!val1.includes(word));
          fc.pre(key1 !== key2);

          const formData: Record<string, string> = {
            [key1]: val1,
            [key2]: val2 + word, // only key2's value contains the word
          };
          const matches: SensitiveMatch[] = [
            { word, category: "PII" as SensitiveMatch["category"], startIndex: 0, endIndex: word.length },
          ];
          const result = sanitizeFormData(formData, matches);
          // key1's value should remain unchanged
          expect(result[key1]).toBe(val1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 12: CSV 导出仅限 ADMIN ====================
// Feature: dcr-complete-ui, Property 12: CSV 导出仅限 ADMIN
// **Validates: Requirements 5.2, 5.3**

describe("Property 12: CSV 导出仅限 ADMIN — non-ADMIN roles get 403", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("非 ADMIN 角色访问导出路由返回 403", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonAdminRoles),
        fc.uuid(),
        async (role, caseId) => {
          vi.clearAllMocks();

          setSession(`user-${role}`, role);

          const { GET } = await import("../[id]/export/route");
          const res = await GET(makeGetRequest(caseId), makeContext(caseId));
          expect(res.status).toBe(403);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("未认证用户访问导出路由返回 401", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (caseId) => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue(null);

        const { GET } = await import("../[id]/export/route");
        const res = await GET(makeGetRequest(caseId), makeContext(caseId));
        expect(res.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });

  it("ADMIN 角色可以访问导出路由（不返回 403）", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (caseId) => {
        vi.clearAllMocks();

        setSession("admin-user", "ADMIN");
        // Mock case not found to get 404 (proves we passed auth)
        mockCaseFindUnique.mockResolvedValue(null);

        const { GET } = await import("../[id]/export/route");
        const res = await GET(makeGetRequest(caseId), makeContext(caseId));
        // Should NOT be 403 — either 404 (case not found) or 200
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      }),
      { numRuns: 100 },
    );
  });
});
