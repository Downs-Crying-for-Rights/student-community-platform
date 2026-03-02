import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fc from "fast-check";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockCaseFindMany = vi.fn();
const mockCaseCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    case: {
      create: vi.fn(),
      findMany: (...args: unknown[]) => mockCaseFindMany(...args),
      count: (...args: unknown[]) => mockCaseCount(...args),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  AuditAction: { CASE_ACCESS: "CASE_ACCESS" },
  AuditTargetType: { CASE: "CASE" },
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Types & Constants ====================

const roles = ["USER", "ADMIN", "DCR_HELPER"] as const;
type TestRole = (typeof roles)[number];

// ==================== Generators ====================

/** Generate a random (dcrAccess, role, hasCase) combination */
function arbCasesInput() {
  return fc.record({
    dcrAccess: fc.boolean(),
    role: fc.constantFrom(...roles),
    hasCase: fc.boolean(),
  });
}

/** Generate a mock case record for a given user */
function makeMockCase(userId: string) {
  return {
    id: `case-${userId}`,
    status: "OPENED",
    category: "TUTORING",
    formData: {},
    pledgeText: "声明",
    submitterId: userId,
    handlerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    submitter: { id: userId, nickname: "测试用户" },
    handler: null,
  };
}

// ==================== Helpers ====================

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/cases");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Property: GET /api/cases 对所有 (dcrAccess, role, hasCase) 组合返回正确响应 ====================
// Feature: dcr-admin-review-and-visibility, Property 3 + Property 4
// **Validates: Requirements 2.4, 3.7, 3.8**

describe("Property: GET /api/cases 对所有 (dcrAccess, role, hasCase) 组合返回正确响应", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("所有已认证的 (dcrAccess, role, hasCase) 组合均返回 200（非 403）", async () => {
    await fc.assert(
      fc.asyncProperty(arbCasesInput(), async ({ dcrAccess, role, hasCase }) => {
        vi.clearAllMocks();

        const userId = `user-${role}-${dcrAccess}-${hasCase}`;
        setSession(userId, role);

        // Mock user lookup (only called for non-ADMIN)
        if (role !== "ADMIN") {
          mockUserFindUnique.mockResolvedValue({ dcrAccess });
        }

        // Mock case data based on hasCase
        const cases = hasCase ? [makeMockCase(userId)] : [];
        mockCaseFindMany.mockResolvedValue(cases);
        mockCaseCount.mockResolvedValue(cases.length);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} });

        // Core property: ALL authenticated users get 200, never 403
        expect(res.status).toBe(200);
      }),
      { numRuns: 100 },
    );
  });

  it("ADMIN 角色始终看到所有 cases（where 无 submitterId 限制）", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.boolean(), async (dcrAccess, hasCase) => {
        vi.clearAllMocks();

        setSession("admin-user", "ADMIN");

        const cases = hasCase ? [makeMockCase("someone-else")] : [];
        mockCaseFindMany.mockResolvedValue(cases);
        mockCaseCount.mockResolvedValue(cases.length);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.cases).toHaveLength(cases.length);

        // ADMIN should not have submitterId constraint
        const call = mockCaseFindMany.mock.calls[0][0];
        expect(call.where.submitterId).toBeUndefined();
        // ADMIN should not trigger user lookup
        expect(mockUserFindUnique).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });

  it("DCR_HELPER 角色始终返回 200 并使用 OR 条件查询", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.boolean(), async (dcrAccess, hasCase) => {
        vi.clearAllMocks();

        const userId = "helper-user";
        setSession(userId, "DCR_HELPER");
        mockUserFindUnique.mockResolvedValue({ dcrAccess });

        const cases = hasCase ? [makeMockCase(userId)] : [];
        mockCaseFindMany.mockResolvedValue(cases);
        mockCaseCount.mockResolvedValue(cases.length);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} });

        expect(res.status).toBe(200);

        // DCR_HELPER uses AND/OR structure (Task 4.1 fix):
        // where.AND = [{ OR: [{ handlers: { some: { userId } } }, { submitterId: userId }, { status: "OPENED" }] }]
        const call = mockCaseFindMany.mock.calls[0][0];
        expect(call.where.AND).toBeDefined();
        expect(Array.isArray(call.where.AND)).toBe(true);
        const orClause = call.where.AND[0];
        expect(orClause.OR).toBeDefined();
        expect(orClause.OR).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ handlers: { some: { userId } } }),
            expect.objectContaining({ submitterId: userId }),
            expect.objectContaining({ status: "OPENED" }),
          ]),
        );
      }),
      { numRuns: 50 },
    );
  });

  it("USER 角色根据 dcrAccess 使用不同查询条件", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.boolean(), async (dcrAccess, hasCase) => {
        vi.clearAllMocks();

        const userId = `regular-user-${dcrAccess}`;
        setSession(userId, "USER");
        mockUserFindUnique.mockResolvedValue({ dcrAccess });

        const cases = hasCase ? [makeMockCase(userId)] : [];
        mockCaseFindMany.mockResolvedValue(cases);
        mockCaseCount.mockResolvedValue(cases.length);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} });
        const data = await res.json();

        // Never 403 — this is the key bug fix property
        expect(res.status).toBe(200);
        expect(data.cases).toHaveLength(cases.length);

        const call = mockCaseFindMany.mock.calls[0][0];
        if (dcrAccess) {
          // dcrAccess=true → AND/OR structure (Task 4.1 fix):
          // where.AND = [{ OR: [{ handlers: { some: { userId } } }, { submitterId: userId }, { status: "OPENED" }] }]
          expect(call.where.AND).toBeDefined();
          expect(Array.isArray(call.where.AND)).toBe(true);
          const orClause = call.where.AND[0];
          expect(orClause.OR).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ handlers: { some: { userId } } }),
              expect.objectContaining({ submitterId: userId }),
              expect.objectContaining({ status: "OPENED" }),
            ]),
          );
        } else {
          // dcrAccess=false → submitterId constraint only
          expect(call.where.submitterId).toBe(userId);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("USER with dcrAccess=false and hasCase=false 返回 200 和空列表", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        vi.clearAllMocks();

        const userId = "no-access-no-case-user";
        setSession(userId, "USER");
        mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
        mockCaseFindMany.mockResolvedValue([]);
        mockCaseCount.mockResolvedValue(0);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.cases).toEqual([]);
        expect(data.total).toBe(0);
      }),
      { numRuns: 50 },
    );
  });
});
