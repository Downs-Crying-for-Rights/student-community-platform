import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  checkPermission,
  hasMinimumRole,
  ROLE_PERMISSIONS,
  type Action,
} from "../rbac";
import {
  evaluateABACPolicy,
  canCreatePost,
  canAccessZone,
  NEWCOMER_AGE_DAYS,
  NEWCOMER_DAILY_POST_LIMIT,
  VIOLATION_THRESHOLD,
  VIOLATION_DAILY_POST_LIMIT,
  type ABACUserAttributes,
} from "../abac";
import type { Role } from "@prisma/client";

// ==================== Generators ====================

const ALL_ROLES: Role[] = ["USER", "TRUSTED_USER", "MODERATOR", "ADMIN", "DCR_HELPER", "SUPER_ADMIN"];

/** Existing roles before SUPER_ADMIN was added */
const EXISTING_ROLES: Role[] = ["USER", "TRUSTED_USER", "MODERATOR", "ADMIN", "DCR_HELPER"];

const arbRole = fc.constantFrom<Role>(...ALL_ROLES);

const arbExistingRole = fc.constantFrom<Role>(...EXISTING_ROLES);

/** Main hierarchy roles (excluding DCR_HELPER branch) */
const MAIN_HIERARCHY: Role[] = ["USER", "TRUSTED_USER", "MODERATOR", "ADMIN"];

const arbMainRole = fc.constantFrom<Role>(...MAIN_HIERARCHY);

/** Generate ABAC user attributes with controlled ranges */
function arbABACUser(): fc.Arbitrary<ABACUserAttributes> {
  return fc.record({
    // Account age: 0 to 365 days ago
    createdAt: fc.integer({ min: 0, max: 365 }).map(
      (daysAgo) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    ),
    violationCount: fc.integer({ min: 0, max: 20 }),
    onboardingDone: fc.boolean(),
    quizPassed: fc.boolean(),
    psychAccess: fc.boolean(),
    dcrAccess: fc.boolean(),
    dcrPledgeSigned: fc.boolean(),
    reputationScore: fc.integer({ min: 0, max: 1000 }),
    role: arbRole,
  });
}

// ==================== Property 1: RBAC 角色权限一致性 ====================
// **Validates: Requirements 7.1, 7.2**

describe("属性 1: RBAC 角色权限一致性", () => {
  it("主层级中高角色应拥有低角色的所有权限（权限继承）", () => {
    const hierarchyPairs: [Role, Role][] = [
      ["TRUSTED_USER", "USER"],
      ["MODERATOR", "TRUSTED_USER"],
      ["ADMIN", "MODERATOR"],
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...hierarchyPairs),
        ([higherRole, lowerRole]) => {
          const higherPerms = ROLE_PERMISSIONS[higherRole];
          const lowerPerms = ROLE_PERMISSIONS[lowerRole];

          for (const action of lowerPerms) {
            expect(higherPerms.has(action)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("DCR_HELPER 应继承 TRUSTED_USER 的所有权限", () => {
    const trustedPerms = ROLE_PERMISSIONS.TRUSTED_USER;
    const dcrPerms = ROLE_PERMISSIONS.DCR_HELPER;

    for (const action of trustedPerms) {
      expect(dcrPerms.has(action)).toBe(true);
    }
  });

  it("对于任意角色，checkPermission 结果应与 ROLE_PERMISSIONS 映射一致", () => {
    const allActions: Action[] = [
      "read", "create_post", "edit_own_post", "delete_own_post",
      "create_comment", "edit_own_comment", "delete_own_comment",
      "like", "bookmark", "report", "access_psychology",
      "moderate_content", "manage_reports", "manage_tags",
      "manage_users", "manage_boards", "manage_invites",
      "view_audit_logs", "manage_dcr_access", "handle_dcr_cases",
    ];

    fc.assert(
      fc.property(
        arbRole,
        fc.constantFrom(...allActions),
        (role, action) => {
          const expected = ROLE_PERMISSIONS[role].has(action);
          const actual = checkPermission(role, action);
          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("hasMinimumRole 在主层级中应满足传递性", () => {
    fc.assert(
      fc.property(
        arbMainRole,
        arbMainRole,
        arbMainRole,
        (a, b, c) => {
          if (hasMinimumRole(a, b) && hasMinimumRole(b, c)) {
            expect(hasMinimumRole(a, c)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("每个角色至少拥有 USER 的所有权限", () => {
    const userPerms = ROLE_PERMISSIONS.USER;

    fc.assert(
      fc.property(arbRole, (role) => {
        const rolePerms = ROLE_PERMISSIONS[role];
        for (const action of userPerms) {
          expect(rolePerms.has(action)).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });
});

/** Generate ABAC user attributes with controlled ranges (excluding SUPER_ADMIN for normal ABAC tests) */
function arbABACUserNonSuperAdmin(): fc.Arbitrary<ABACUserAttributes> {
  return fc.record({
    createdAt: fc.integer({ min: 0, max: 365 }).map(
      (daysAgo) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    ),
    violationCount: fc.integer({ min: 0, max: 20 }),
    onboardingDone: fc.boolean(),
    quizPassed: fc.boolean(),
    psychAccess: fc.boolean(),
    dcrAccess: fc.boolean(),
    dcrPledgeSigned: fc.boolean(),
    reputationScore: fc.integer({ min: 0, max: 1000 }),
    role: arbExistingRole,
  });
}

// ==================== Property 2: ABAC 属性限制正确性 ====================
// **Validates: Requirements 7.4, 7.5, 7.6**

describe("属性 2: ABAC 属性限制正确性", () => {
  it("账号年龄 < 7 天的用户，maxDailyPosts 应 <= 3", () => {
    const arbNewcomer = arbABACUserNonSuperAdmin().filter((u) => {
      const ageDays = Math.floor(
        (Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      return ageDays < NEWCOMER_AGE_DAYS;
    });

    fc.assert(
      fc.property(arbNewcomer, (user) => {
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).not.toBeNull();
        expect(policy.maxDailyPosts!).toBeLessThanOrEqual(NEWCOMER_DAILY_POST_LIMIT);
        expect(policy.isNewcomer).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("违规次数 > 3 的用户，maxDailyPosts 应 <= 1", () => {
    const arbViolator = arbABACUserNonSuperAdmin().filter(
      (u) => u.violationCount > VIOLATION_THRESHOLD,
    );

    fc.assert(
      fc.property(arbViolator, (user) => {
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).not.toBeNull();
        expect(policy.maxDailyPosts!).toBeLessThanOrEqual(VIOLATION_DAILY_POST_LIMIT);
      }),
      { numRuns: 200 },
    );
  });

  it("违规次数 > 3 且账号年龄 < 7 天的用户，maxDailyPosts 应为 1（更严格的限制优先）", () => {
    const arbNewcomerViolator = arbABACUserNonSuperAdmin().filter((u) => {
      const ageDays = Math.floor(
        (Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      return ageDays < NEWCOMER_AGE_DAYS && u.violationCount > VIOLATION_THRESHOLD;
    });

    fc.assert(
      fc.property(arbNewcomerViolator, (user) => {
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBe(VIOLATION_DAILY_POST_LIMIT);
        expect(policy.isNewcomer).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("账号年龄 >= 7 天且违规次数 <= 3 的用户，maxDailyPosts 应为 null（无限制）", () => {
    const arbNormalUser = arbABACUserNonSuperAdmin().filter((u) => {
      const ageDays = Math.floor(
        (Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      return ageDays >= NEWCOMER_AGE_DAYS && u.violationCount <= VIOLATION_THRESHOLD;
    });

    fc.assert(
      fc.property(arbNormalUser, (user) => {
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBeNull();
        expect(policy.isNewcomer).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("账号年龄 < 7 天的用户不可进入私密区", () => {
    const arbNewcomer = arbABACUserNonSuperAdmin().filter((u) => {
      const ageDays = Math.floor(
        (Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      return ageDays < NEWCOMER_AGE_DAYS;
    });

    fc.assert(
      fc.property(arbNewcomer, (user) => {
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPrivateZone).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

// ==================== All Actions ====================

const ALL_ACTIONS: Action[] = [
  "read", "create_post", "edit_own_post", "delete_own_post",
  "create_comment", "edit_own_comment", "delete_own_comment",
  "like", "bookmark", "report", "access_psychology",
  "moderate_content", "manage_reports", "manage_tags",
  "manage_users", "manage_boards", "manage_invites",
  "view_audit_logs", "manage_dcr_access", "handle_dcr_cases",
];

const arbAction = fc.constantFrom<Action>(...ALL_ACTIONS);

// ==================== Feature: super-admin-role, Property 1: SUPER_ADMIN 通过所有 RBAC 权限检查 ====================
// **Validates: Requirements 2.1, 2.3**

describe("Feature: super-admin-role, Property 1: SUPER_ADMIN 通过所有 RBAC 权限检查", () => {
  it("对于任意 Action，checkPermission('SUPER_ADMIN', action) 应返回 true", () => {
    fc.assert(
      fc.property(
        arbAction,
        (action) => {
          expect(checkPermission("SUPER_ADMIN", action)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("对于任意 Action 和任意 Resource，checkPermission('SUPER_ADMIN', action, resource) 应返回 true", () => {
    const arbResource = fc.constantFrom<import("../rbac").Resource>(
      "post", "comment", "board", "tag", "report", "user",
      "invite", "audit_log", "dcr_case", "psychology_zone",
      "dcr_zone", "notification", "knowledge_article",
    );

    fc.assert(
      fc.property(
        arbAction,
        arbResource,
        (action, resource) => {
          expect(checkPermission("SUPER_ADMIN", action, resource)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Feature: super-admin-role, Property 2: SUPER_ADMIN 满足所有角色等级要求 ====================
// **Validates: Requirements 2.2**

describe("Feature: super-admin-role, Property 2: SUPER_ADMIN 满足所有角色等级要求", () => {
  it("对于任意 Role 作为 requiredRole，hasMinimumRole('SUPER_ADMIN', requiredRole) 应返回 true", () => {
    fc.assert(
      fc.property(
        arbRole,
        (requiredRole) => {
          expect(hasMinimumRole("SUPER_ADMIN", requiredRole)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Feature: super-admin-role, Property 4: 现有角色向后兼容 ====================
// **Validates: Requirements 1.2**

describe("Feature: super-admin-role, Property 4: 现有角色向后兼容", () => {
  /**
   * Snapshot of expected permissions for existing roles before SUPER_ADMIN was added.
   * Used to verify backward compatibility.
   */
  const EXPECTED_PERMISSIONS: Record<string, ReadonlySet<Action>> = {
    USER: new Set(["read", "create_post", "edit_own_post", "delete_own_post", "create_comment", "edit_own_comment", "delete_own_comment", "like", "bookmark", "report"]),
    TRUSTED_USER: new Set(["read", "create_post", "edit_own_post", "delete_own_post", "create_comment", "edit_own_comment", "delete_own_comment", "like", "bookmark", "report", "access_psychology"]),
    MODERATOR: new Set(["read", "create_post", "edit_own_post", "delete_own_post", "create_comment", "edit_own_comment", "delete_own_comment", "like", "bookmark", "report", "access_psychology", "moderate_content", "manage_reports", "manage_tags"]),
    ADMIN: new Set(["read", "create_post", "edit_own_post", "delete_own_post", "create_comment", "edit_own_comment", "delete_own_comment", "like", "bookmark", "report", "access_psychology", "moderate_content", "manage_reports", "manage_tags", "manage_users", "manage_boards", "manage_invites", "view_audit_logs", "manage_dcr_access"]),
    DCR_HELPER: new Set(["read", "create_post", "edit_own_post", "delete_own_post", "create_comment", "edit_own_comment", "delete_own_comment", "like", "bookmark", "report", "access_psychology", "handle_dcr_cases"]),
  };

  it("对于任意现有角色和任意 Action，checkPermission 的返回值应与新增 SUPER_ADMIN 前一致", () => {
    fc.assert(
      fc.property(
        arbExistingRole,
        arbAction,
        (role, action) => {
          const expected = EXPECTED_PERMISSIONS[role].has(action);
          const actual = checkPermission(role, action);
          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("对于任意现有角色，ROLE_PERMISSIONS 中的权限集合大小应与预期一致", () => {
    fc.assert(
      fc.property(
        arbExistingRole,
        (role) => {
          expect(ROLE_PERMISSIONS[role].size).toBe(EXPECTED_PERMISSIONS[role].size);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Feature: super-admin-role, Property 3: SUPER_ADMIN 绕过所有 ABAC 限制 ====================
// **Validates: Requirements 3.1, 3.2, 3.3**

describe("Feature: super-admin-role, Property 3: SUPER_ADMIN 绕过所有 ABAC 限制", () => {
  /** Generator for SUPER_ADMIN user with arbitrary ABAC attributes */
  const arbSuperAdminUser = fc.record({
    createdAt: fc.integer({ min: 0, max: 365 }).map(
      (daysAgo) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    ),
    violationCount: fc.integer({ min: 0, max: 20 }),
    onboardingDone: fc.boolean(),
    quizPassed: fc.boolean(),
    psychAccess: fc.boolean(),
    dcrAccess: fc.boolean(),
    dcrPledgeSigned: fc.boolean(),
    reputationScore: fc.integer({ min: 0, max: 1000 }),
    role: fc.constant("SUPER_ADMIN" as Role),
  });

  it("对于任意 ABAC 用户属性，SUPER_ADMIN 的 evaluateABACPolicy 返回无限制策略", () => {
    fc.assert(
      fc.property(arbSuperAdminUser, (user) => {
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBeNull();
        expect(policy.canAccessPrivateZone).toBe(true);
        expect(policy.canSendDM).toBe(true);
        expect(policy.canAccessDCR).toBe(true);
        expect(policy.canAccessPsychology).toBe(true);
        expect(policy.isNewcomer).toBe(false);
        expect(policy.hasPassedQuiz).toBe(true);
        expect(policy.restrictions).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it("对于任意 todayPostCount，SUPER_ADMIN 的 canCreatePost 返回 allowed: true", () => {
    fc.assert(
      fc.property(
        arbSuperAdminUser,
        fc.integer({ min: 0, max: 10000 }),
        (user, todayPostCount) => {
          const result = canCreatePost(user, todayPostCount);
          expect(result.allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("对于所有区域，SUPER_ADMIN 的 canAccessZone 返回 allowed: true", () => {
    const arbZone = fc.constantFrom<"PUBLIC" | "PSYCHOLOGY" | "DCR">("PUBLIC", "PSYCHOLOGY", "DCR");

    fc.assert(
      fc.property(
        arbSuperAdminUser,
        arbZone,
        (user, zone) => {
          const result = canAccessZone(user, zone);
          expect(result.allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
