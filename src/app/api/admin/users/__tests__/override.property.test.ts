import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: {
    SUPER_ADMIN_OVERRIDE: "SUPER_ADMIN_OVERRIDE",
  },
  AuditTargetType: {
    USER: "USER",
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);


// ==================== Generators ====================

const NON_SUPER_ADMIN_ROLES: Role[] = ["USER", "TRUSTED_USER", "DCR_HELPER", "MODERATOR", "ADMIN"];
const ALL_ROLES: Role[] = [...NON_SUPER_ADMIN_ROLES, "SUPER_ADMIN"];

const arbNonSuperAdminRole = fc.constantFrom<Role>(...NON_SUPER_ADMIN_ROLES);
const arbRole = fc.constantFrom<Role>(...ALL_ROLES);

const arbOverrideFields = fc.record({
  reputationScore: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
  violationCount: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  psychAccess: fc.option(fc.boolean(), { nil: undefined }),
  dcrAccess: fc.option(fc.boolean(), { nil: undefined }),
  dcrPledgeSigned: fc.option(fc.boolean(), { nil: undefined }),
  quizPassed: fc.option(fc.boolean(), { nil: undefined }),
  onboardingDone: fc.option(fc.boolean(), { nil: undefined }),
}).filter((obj) => Object.values(obj).some((v) => v !== undefined));

// ==================== Helpers ====================

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users/target1/override", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const defaultUser = {
  id: "target1",
  reputationScore: 100,
  violationCount: 0,
  psychAccess: false,
  dcrAccess: false,
  dcrPledgeSigned: false,
  quizPassed: true,
  onboardingDone: true,
  role: "USER",
};

// ==================== Feature: super-admin-role, Property 5: 属性覆写 API 正确应用变更 ====================

describe("Feature: super-admin-role, Property 5: 属性覆写 API 正确应用变更", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("对于任意有效覆写字段，SUPER_ADMIN 覆写后数据库应更新为提交的值", async () => {
    await fc.assert(
      fc.asyncProperty(arbOverrideFields, async (fields) => {
        vi.clearAllMocks();
        setSession("sa1", "SUPER_ADMIN");
        mockUserFindUnique.mockResolvedValue({ ...defaultUser });

        // Build expected update data (only defined fields)
        const expectedData: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) expectedData[k] = v;
        }

        mockUserUpdate.mockResolvedValue({ ...defaultUser, ...expectedData });
        mockLogAudit.mockResolvedValue({});

        const { PATCH } = await import("../[id]/override/route");
        const res = await PATCH(makeRequest(fields), {
          params: Promise.resolve({ id: "target1" }),
        });

        expect(res.status).toBe(200);
        expect(mockUserUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ data: expectedData }),
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Feature: super-admin-role, Property 6: 覆写 API 仅限 SUPER_ADMIN 访问 ====================

describe("Feature: super-admin-role, Property 6: 覆写 API 仅限 SUPER_ADMIN 访问", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("对于任意非 SUPER_ADMIN 角色，调用覆写 API 应返回 403", async () => {
    await fc.assert(
      fc.asyncProperty(arbNonSuperAdminRole, arbOverrideFields, async (role, fields) => {
        vi.clearAllMocks();
        setSession("op1", role);
        mockUserFindUnique.mockResolvedValue({ ...defaultUser });

        const { PATCH } = await import("../[id]/override/route");
        const res = await PATCH(makeRequest(fields), {
          params: Promise.resolve({ id: "target1" }),
        });

        expect(res.status).toBe(403);
        expect(mockUserUpdate).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Feature: super-admin-role, Property 7: 覆写操作审计日志完整性 ====================

describe("Feature: super-admin-role, Property 7: 覆写操作审计日志完整性", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("对于任意覆写操作，审计日志应包含操作者 ID、SUPER_ADMIN_OVERRIDE 操作类型、目标用户 ID 和前后值", async () => {
    await fc.assert(
      fc.asyncProperty(arbOverrideFields, async (fields) => {
        vi.clearAllMocks();
        setSession("sa1", "SUPER_ADMIN");
        mockUserFindUnique.mockResolvedValue({ ...defaultUser });

        const expectedData: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) expectedData[k] = v;
        }

        mockUserUpdate.mockResolvedValue({ ...defaultUser, ...expectedData });
        mockLogAudit.mockResolvedValue({});

        const { PATCH } = await import("../[id]/override/route");
        await PATCH(makeRequest(fields), {
          params: Promise.resolve({ id: "target1" }),
        });

        expect(mockLogAudit).toHaveBeenCalledTimes(1);
        const [operatorId, action, targetType, targetId, details] = mockLogAudit.mock.calls[0];
        expect(operatorId).toBe("sa1");
        expect(action).toBe("SUPER_ADMIN_OVERRIDE");
        expect(targetType).toBe("USER");
        expect(targetId).toBe("target1");
        expect(details).toHaveProperty("beforeValues");
        expect(details).toHaveProperty("afterValues");

        // Verify before/after values match the changed fields
        for (const field of Object.keys(expectedData)) {
          expect(details.beforeValues[field]).toBe((defaultUser as Record<string, unknown>)[field]);
          expect(details.afterValues[field]).toBe(expectedData[field]);
        }
      }),
      { numRuns: 100 },
    );
  });
});
