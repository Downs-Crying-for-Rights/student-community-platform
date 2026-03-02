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
    ROLE_CHANGE: "ROLE_CHANGE",
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
const arbTargetRole = fc.constantFrom<Role>(...ALL_ROLES);
const arbUserId = fc.stringMatching(/^[a-z0-9]{8,16}$/);

// ==================== Helpers ====================

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users/target1/role", {
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

// ==================== Feature: super-admin-role, Property 8: 非 SUPER_ADMIN 不可授予 SUPER_ADMIN 角色 ====================
// **Validates: Requirements 7.1, 7.2**

describe("Feature: super-admin-role, Property 8: 非 SUPER_ADMIN 不可授予 SUPER_ADMIN 角色", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("对于任意非 SUPER_ADMIN 角色的操作者，尝试将任意用户角色设为 SUPER_ADMIN 应返回 403 且目标用户角色不变", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNonSuperAdminRole,
        arbUserId,
        arbTargetRole.filter((r) => r !== "SUPER_ADMIN"),
        async (operatorRole, targetId, currentTargetRole) => {
          vi.clearAllMocks();

          // Set operator session with non-SUPER_ADMIN role
          setSession("operator1", operatorRole);

          // Target user exists with some current role (not SUPER_ADMIN)
          mockUserFindUnique.mockResolvedValue({ id: targetId, role: currentTargetRole });
          mockUserUpdate.mockResolvedValue({ id: targetId, role: "SUPER_ADMIN" });
          mockLogAudit.mockResolvedValue({});

          const { PATCH } = await import("../[id]/role/route");
          const res = await PATCH(makeRequest({ role: "SUPER_ADMIN" }), {
            params: Promise.resolve({ id: targetId }),
          });

          // Non-SUPER_ADMIN operators with insufficient role level get 403 from withAuth
          // ADMIN-level operators get 403 from the SUPER_ADMIN grant protection
          expect(res.status).toBe(403);

          // Target user's role should not have been updated
          expect(mockUserUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
