import { describe, it, expect } from "vitest";
import {
  evaluateABACPolicy,
  canCreatePost,
  canAccessZone,
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
    reputationScore: 100, // trustLevel 2
    role: "USER",
    ...overrides,
  };
}

/** Helper: create a true newcomer (trustLevel 0, repScore ≤ 30). */
function makeNewcomer(overrides: Partial<ABACUserAttributes> = {}): ABACUserAttributes {
  return makeUser({
      reputationScore: 20, // trustLevel 0
      createdAt: new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000), // <1 day ago → accountAgeDays = 0
      ...overrides,
    });
}

/** Helper: create a SUPER_ADMIN user with worst-case attributes. */
function makeSuperAdmin(overrides: Partial<ABACUserAttributes> = {}): ABACUserAttributes {
  return {
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
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

describe("ABAC 属性策略引擎 (信任等级制)", () => {
  describe("evaluateABACPolicy", () => {
    describe("信任等级限制 (trustLevel < 2 = 新手)", () => {
      it("信任等级 0 用户每日发帖上限为 1 篇", () => {
        const user = makeNewcomer(); // repScore 20 → trustLevel 0
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBe(1);
        expect(policy.isNewcomer).toBe(true);
      });

      it("信任等级 0 用户禁止进入私密区", () => {
        const user = makeNewcomer();
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPrivateZone).toBe(false);
      });

      it("信任等级 0 用户禁止私信", () => {
        const user = makeNewcomer();
        const policy = evaluateABACPolicy(user);
        expect(policy.canSendDM).toBe(false);
      });

      it("信任等级 2 用户无新手限制", () => {
        const user = makeUser(); // repScore 100 → trustLevel 2
        const policy = evaluateABACPolicy(user);
        expect(policy.isNewcomer).toBe(false);
        expect(policy.canSendDM).toBe(true);
        expect(policy.canAccessPrivateZone).toBe(true);
      });

      it("高信任等级用户仍需 psychAccess 才能访问心理区", () => {
        const user = makeUser({ reputationScore: 160, psychAccess: false });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPsychology).toBe(false);
      });
    });

    describe("违规次数限制", () => {
      it("违规次数 > 3 时每日发帖限制为 1 篇", () => {
        const user = makeUser({ violationCount: 4 });
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBe(1);
      });

      it("违规次数恰好为 3 时不触发额外限制", () => {
        const user = makeUser({ violationCount: 3 });
        const policy = evaluateABACPolicy(user);
        // trustLevel 2 gives 5/day, no violation cap applies
        expect(policy.maxDailyPosts).toBe(5);
      });

      it("违规次数为 0 时 trustLevel 2 发帖上限 5 篇", () => {
        const user = makeUser({ violationCount: 0 });
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBe(5);
      });

      it("新手 + 高违规次数时取更严格的限制（1 篇）", () => {
        const user = makeNewcomer({ violationCount: 5 });
        const policy = evaluateABACPolicy(user);
        expect(policy.maxDailyPosts).toBe(1);
      });
    });

    describe("DCR 区访问", () => {
      it("满足信任等级 + dcrAccess + pledgeSigned 时可访问", () => {
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

      it("管理员已显式授予 DCR 权限后不再按动态信誉重复撤权", () => {
        const user = makeNewcomer({
          dcrAccess: true,
          dcrPledgeSigned: true,
        });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessDCR).toBe(true);
      });
    });

    describe("心理区访问", () => {
      it("psychAccess 为 true 时可访问心理区", () => {
        const user = makeUser({ psychAccess: true });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPsychology).toBe(true);
      });

      it("无 psychAccess 时不可浏览心理区", () => {
        const user = makeUser({ psychAccess: false });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPsychology).toBe(false);
      });

      it("信任等级 0 不可访问心理区", () => {
        const user = makeNewcomer({ psychAccess: false });
        const policy = evaluateABACPolicy(user);
        expect(policy.canAccessPsychology).toBe(false);
      });
    });

    describe("测验状态", () => {
      it("过时的 quizPassed 字段不再影响 ABAC (信任等级为主)", () => {
        const user = makeUser({ quizPassed: false });
        const policy = evaluateABACPolicy(user);
        // quizPassed no longer blocks — trustLevel 2 alone grants access
        expect(policy.canAccessPrivateZone).toBe(true);
      });
    });

    describe("restrictions 列表", () => {
      it("未获心理区准入时应包含对应限制", () => {
        const user = makeUser();
        const policy = evaluateABACPolicy(user);
        expect(policy.restrictions).toContain("未获得心理交流区准入权限");
      });

      it("信任等级 0 用户包含新手限制描述", () => {
        const user = makeNewcomer();
        const policy = evaluateABACPolicy(user);
        expect(policy.restrictions.length).toBeGreaterThan(0);
        expect(policy.restrictions.some((r) => r.includes("信任等级"))).toBe(true);
      });
    });
  });

  describe("canCreatePost", () => {
    it("信任等级 2 用户无发帖数量限制", () => {
      const user = makeUser();
      expect(canCreatePost(user, 0).allowed).toBe(true);
      expect(canCreatePost(user, 4).allowed).toBe(true);
    });

    it("信任等级 0 用户发帖未达上限时允许", () => {
      const user = makeNewcomer();
      expect(canCreatePost(user, 0).allowed).toBe(true);
    });

    it("信任等级 0 用户发帖达到上限 1 篇时拒绝", () => {
      const user = makeNewcomer();
      const result = canCreatePost(user, 1);
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

    it("无 psychAccess 时不可访问心理区", () => {
      const user = makeUser({ psychAccess: false });
      expect(canAccessZone(user, "PSYCHOLOGY").allowed).toBe(false);
    });

    it("信任等级 0 不可访问心理区", () => {
      const user = makeNewcomer();
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
    it("SUPER_ADMIN 返回无限制策略", () => {
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
        createdAt: new Date(),
      });
      const policy = evaluateABACPolicy(user);
      expect(policy.isNewcomer).toBe(false);
      expect(policy.maxDailyPosts).toBeNull();
    });
  });
});
