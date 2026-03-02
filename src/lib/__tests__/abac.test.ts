import { describe, it, expect } from "vitest";
import {
  evaluateABACPolicy,
  canCreatePost,
  canAccessZone,
  NEWCOMER_AGE_DAYS,
  NEWCOMER_DAILY_POST_LIMIT,
  VIOLATION_THRESHOLD,
  VIOLATION_DAILY_POST_LIMIT,
  DCR_MIN_ACCOUNT_AGE_DAYS,
  type ABACUserAttributes,
} from "../abac";

/** Helper: create a user with sensible defaults, overridable via partial. */
function makeUser(overrides: Partial<ABACUserAttributes> = {}): ABACUserAttributes {
  return {
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    violationCount: 0,
    onboardingDone: true,
    quizPassed: true,
    psychAccess: false,
    dcrAccess: false,
    dcrPledgeSigned: false,
    reputationScore: 100,
    role: "USER",
    ...overrides,
  };
}

/** Helper: create a newcomer (account age < 7 days). */
function makeNewcomer(overrides: Partial<ABACUserAttributes> = {}): ABACUserAttributes {
  return makeUser({
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    ...overrides,
  });
}

/** Helper: create a SUPER_ADMIN user with worst-case attributes (newcomer, high violations, no access). */
function makeSuperAdmin(overrides: Partial<ABACUserAttributes> = {}): ABACUserAttributes {
  return {
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago (newcomer)
    violationCount: 10,
    onboardingDone: false,
    quizPassed: false,
    psychAccess: false,
    dcrAccess: false,
    dcrPledgeSigned: false,
    reputationScore: 0,
    role: "SUPER_ADMIN" as ABACUserAttributes["role"],
    ...overrides,
  };
}

describe("ABAC 属性策略引擎", () => {
  describe("evaluateABACPolicy", () => {
    describe("新手限制（账号年龄 < 7 天）", () => {
      it("新手用户每日发帖上限为 3 篇", () => {
        const user = makeNewcomer();
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBe(NEWCOMER_DAILY_POST_LIMIT);
        expect(policy.isNewcomer).toBe(true);
      });

      it("新手用户禁止进入私密区", () => {
        const user = makeNewcomer();
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPrivateZone).toBe(false);
      });

      it("新手用户禁止私信", () => {
        const user = makeNewcomer();
        const policy = evaluateABACPolicy(user);
        expect(policy.canSendDM).toBe(false);
      });

      it("非新手用户无新手限制", () => {
        const user = makeUser(); // 30 days old
        const policy = evaluateABACPolicy(user);
        expect(policy.isNewcomer).toBe(false);
        expect(policy.canSendDM).toBe(true);
      });

      it("恰好 7 天的账号不算新手", () => {
        const user = makeUser({
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        });
        const policy = evaluateABACPolicy(user);
        expect(policy.isNewcomer).toBe(false);
      });
    });

    describe("违规次数限制", () => {
      it("违规次数 > 3 时每日发帖限制为 1 篇", () => {
        const user = makeUser({ violationCount: 4 });
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBe(VIOLATION_DAILY_POST_LIMIT);
      });

      it("违规次数恰好为 3 时不触发限制", () => {
        const user = makeUser({ violationCount: 3 });
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBeNull();
      });

      it("违规次数为 0 时无限制", () => {
        const user = makeUser({ violationCount: 0 });
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBeNull();
      });

      it("新手 + 高违规次数时取更严格的限制（1 篇）", () => {
        const user = makeNewcomer({ violationCount: 5 });
        const policy = evaluateABACPolicy(user);
        // Violation limit (1) is stricter than newcomer limit (3)
        expect(policy.maxDailyPosts).toBe(VIOLATION_DAILY_POST_LIMIT);
      });
    });

    describe("DCR 区访问", () => {
      it("满足所有条件时可访问 DCR 区", () => {
        const user = makeUser({
          dcrAccess: true,
          dcrPledgeSigned: true,
        });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessDCR).toBe(true);
      });

      it("未获得 dcrAccess 时不可访问", () => {
        const user = makeUser({
          dcrAccess: false,
          dcrPledgeSigned: true,
        });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessDCR).toBe(false);
      });

      it("未签署守则时不可访问", () => {
        const user = makeUser({
          dcrAccess: true,
          dcrPledgeSigned: false,
        });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessDCR).toBe(false);
      });

      it("账号年龄不足 7 天时不可访问 DCR", () => {
        const user = makeNewcomer({
          dcrAccess: true,
          dcrPledgeSigned: true,
        });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessDCR).toBe(false);
      });
    });

    describe("心理区访问", () => {
      it("psychAccess 为 true 时可访问心理区", () => {
        const user = makeUser({ psychAccess: true });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPsychology).toBe(true);
      });

      it("psychAccess 为 false 时不可访问心理区", () => {
        const user = makeUser({ psychAccess: false });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPsychology).toBe(false);
      });
    });

    describe("测验状态", () => {
      it("未通过测验时私密区访问受限", () => {
        const user = makeUser({ quizPassed: false });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPrivateZone).toBe(false);
        expect(policy.hasPassedQuiz).toBe(false);
      });

      it("通过测验且非新手时可访问私密区", () => {
        const user = makeUser({ quizPassed: true });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPrivateZone).toBe(true);
        expect(policy.hasPassedQuiz).toBe(true);
      });
    });

    describe("restrictions 列表", () => {
      it("无限制的用户返回空 restrictions", () => {
        const user = makeUser();
        const policy = evaluateABACPolicy(user);
        expect(policy.restrictions).toHaveLength(0);
      });

      it("新手用户包含新手相关限制描述", () => {
        const user = makeNewcomer();
        const policy = evaluateABACPolicy(user);
        expect(policy.restrictions.length).toBeGreaterThan(0);
        expect(policy.restrictions.some((r) => r.includes("7 天"))).toBe(true);
      });
    });
  });

  describe("canCreatePost", () => {
    it("普通用户无发帖数量限制", () => {
      const user = makeUser();
      expect(canCreatePost(user, 0).allowed).toBe(true);
      expect(canCreatePost(user, 100).allowed).toBe(true);
    });

    it("新手用户发帖未达上限时允许", () => {
      const user = makeNewcomer();
      expect(canCreatePost(user, 0).allowed).toBe(true);
      expect(canCreatePost(user, 2).allowed).toBe(true);
    });

    it("新手用户发帖达到上限时拒绝", () => {
      const user = makeNewcomer();
      const result = canCreatePost(user, 3);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("高违规用户发帖达到 1 篇时拒绝", () => {
      const user = makeUser({ violationCount: 5 });
      const result = canCreatePost(user, 1);
      expect(result.allowed).toBe(false);
    });

    it("高违规用户发帖 0 篇时允许", () => {
      const user = makeUser({ violationCount: 5 });
      expect(canCreatePost(user, 0).allowed).toBe(true);
    });
  });

  describe("canAccessZone", () => {
    it("所有用户可访问公开区", () => {
      const newcomer = makeNewcomer();
      expect(canAccessZone(newcomer, "PUBLIC").allowed).toBe(true);

      const user = makeUser();
      expect(canAccessZone(user, "PUBLIC").allowed).toBe(true);
    });

    it("有 psychAccess 的用户可访问心理区", () => {
      const user = makeUser({ psychAccess: true });
      expect(canAccessZone(user, "PSYCHOLOGY").allowed).toBe(true);
    });

    it("无 psychAccess 的用户不可访问心理区", () => {
      const user = makeUser({ psychAccess: false });
      const result = canAccessZone(user, "PSYCHOLOGY");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("满足条件的用户可访问 DCR 区", () => {
      const user = makeUser({
        dcrAccess: true,
        dcrPledgeSigned: true,
      });
      expect(canAccessZone(user, "DCR").allowed).toBe(true);
    });

    it("不满足条件的用户不可访问 DCR 区并返回原因", () => {
      const user = makeUser({
        dcrAccess: false,
        dcrPledgeSigned: false,
      });
      const result = canAccessZone(user, "DCR");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("DCR");
    });
  });

  describe("SUPER_ADMIN 绕过所有 ABAC 限制", () => {
    describe("evaluateABACPolicy", () => {
      it("SUPER_ADMIN 返回无限制策略（即使属性为最差情况）", () => {
        const user = makeSuperAdmin();
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBeNull();
        expect(policy.canAccessPrivateZone).toBe(true);
        expect(policy.canSendDM).toBe(true);
        expect(policy.canAccessDCR).toBe(true);
        expect(policy.canAccessPsychology).toBe(true);
        expect(policy.isNewcomer).toBe(false);
        expect(policy.hasPassedQuiz).toBe(true);
        expect(policy.restrictions).toHaveLength(0);
      });

      it("SUPER_ADMIN 不受新手限制影响", () => {
        const user = makeSuperAdmin({
          createdAt: new Date(), // just created
        });
        const policy = evaluateABACPolicy(user);
        expect(policy.isNewcomer).toBe(false);
        expect(policy.maxDailyPosts).toBeNull();
      });

      it("SUPER_ADMIN 不受高违规次数影响", () => {
        const user = makeSuperAdmin({ violationCount: 100 });
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBeNull();
        expect(policy.restrictions).toHaveLength(0);
      });
    });

    describe("canCreatePost", () => {
      it("SUPER_ADMIN 始终可以发帖（无论 todayPostCount 多大）", () => {
        const user = makeSuperAdmin();
        expect(canCreatePost(user, 0).allowed).toBe(true);
        expect(canCreatePost(user, 100).allowed).toBe(true);
        expect(canCreatePost(user, 999999).allowed).toBe(true);
      });
    });

    describe("canAccessZone", () => {
      it("SUPER_ADMIN 可访问所有区域", () => {
        const user = makeSuperAdmin();
        expect(canAccessZone(user, "PUBLIC").allowed).toBe(true);
        expect(canAccessZone(user, "PSYCHOLOGY").allowed).toBe(true);
        expect(canAccessZone(user, "DCR").allowed).toBe(true);
      });

      it("SUPER_ADMIN 无需 psychAccess 即可访问心理区", () => {
        const user = makeSuperAdmin({ psychAccess: false });
        expect(canAccessZone(user, "PSYCHOLOGY").allowed).toBe(true);
      });

      it("SUPER_ADMIN 无需 dcrAccess/dcrPledgeSigned 即可访问 DCR 区", () => {
        const user = makeSuperAdmin({
          dcrAccess: false,
          dcrPledgeSigned: false,
        });
        expect(canAccessZone(user, "DCR").allowed).toBe(true);
      });
    });
  });
});
