import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeScore,
  getReputationLevel,
  calculateReputationScore,
  updateUserReputation,
  gatherFactors,
  BASE_SCORE,
  POINTS_PER_POST,
  MAX_POST_BONUS,
  POINTS_PER_HIGH_QUALITY_POST,
  MAX_HIGH_QUALITY_BONUS,
  POINTS_PER_WEEK,
  MAX_AGE_BONUS,
  PENALTY_PER_VIOLATION,
  PENALTY_PER_RESOLVED_REPORT,
  PENALTY_BAN_HISTORY,
  MIN_SCORE,
  MAX_SCORE,
  type ReputationFactors,
} from "../reputation";

// ==================== Mock Prisma ====================

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    post: {
      count: vi.fn(),
    },
    report: {
      count: vi.fn(),
    },
  };
  return { default: mockPrisma, prisma: mockPrisma };
});

import prisma from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  user: {
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  post: { count: ReturnType<typeof vi.fn> };
  report: { count: ReturnType<typeof vi.fn> };
};

// ==================== Helpers ====================

function makeFactors(overrides: Partial<ReputationFactors> = {}): ReputationFactors {
  return {
    postCount: 0,
    highQualityPostCount: 0,
    accountAgeWeeks: 0,
    violationCount: 0,
    resolvedReportsAgainst: 0,
    hasBanHistory: false,
    ...overrides,
  };
}

// ==================== Tests ====================

describe("信誉等级系统 (Reputation System)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------
  // computeScore — pure function tests
  // --------------------------------------------------
  describe("computeScore", () => {
    it("新用户（无任何活动）返回基础分 100", () => {
      const score = computeScore(makeFactors());
      expect(score).toBe(BASE_SCORE);
    });

    // --- Positive factors ---

    it("每篇帖子 +2 分", () => {
      const score = computeScore(makeFactors({ postCount: 5 }));
      expect(score).toBe(BASE_SCORE + 5 * POINTS_PER_POST);
    });

    it("帖子加分上限为 +40", () => {
      const score = computeScore(makeFactors({ postCount: 100 }));
      expect(score).toBe(BASE_SCORE + MAX_POST_BONUS);
    });

    it("高质量帖子（>10 赞）每篇 +5 分", () => {
      const score = computeScore(makeFactors({ highQualityPostCount: 3 }));
      expect(score).toBe(BASE_SCORE + 3 * POINTS_PER_HIGH_QUALITY_POST);
    });

    it("高质量帖子加分上限为 +25", () => {
      const score = computeScore(makeFactors({ highQualityPostCount: 50 }));
      expect(score).toBe(BASE_SCORE + MAX_HIGH_QUALITY_BONUS);
    });

    it("账号年龄每周 +1 分", () => {
      const score = computeScore(makeFactors({ accountAgeWeeks: 10 }));
      expect(score).toBe(BASE_SCORE + 10 * POINTS_PER_WEEK);
    });

    it("账号年龄加分上限为 +20", () => {
      const score = computeScore(makeFactors({ accountAgeWeeks: 100 }));
      expect(score).toBe(BASE_SCORE + MAX_AGE_BONUS);
    });

    // --- Negative factors ---

    it("每次违规 -15 分", () => {
      const score = computeScore(makeFactors({ violationCount: 2 }));
      expect(score).toBe(BASE_SCORE + 2 * PENALTY_PER_VIOLATION);
    });

    it("每条已处理举报 -5 分", () => {
      const score = computeScore(makeFactors({ resolvedReportsAgainst: 4 }));
      expect(score).toBe(BASE_SCORE + 4 * PENALTY_PER_RESOLVED_REPORT);
    });

    it("有封禁历史 -30 分", () => {
      const score = computeScore(makeFactors({ hasBanHistory: true }));
      expect(score).toBe(BASE_SCORE + PENALTY_BAN_HISTORY);
    });

    // --- Clamping ---

    it("分数不低于 0", () => {
      const score = computeScore(
        makeFactors({ violationCount: 20, resolvedReportsAgainst: 20, hasBanHistory: true }),
      );
      expect(score).toBe(MIN_SCORE);
    });

    it("所有正面因子满值时分数为 185（上限 200 内）", () => {
      const score = computeScore(
        makeFactors({
          postCount: 100,          // capped at +40
          highQualityPostCount: 100, // capped at +25
          accountAgeWeeks: 200,    // capped at +20
        }),
      );
      // 100 + 40 + 25 + 20 = 185, within [0, 200]
      expect(score).toBe(185);
      expect(score).toBeLessThanOrEqual(MAX_SCORE);
    });

    // --- Combined scenarios ---

    it("活跃用户（多帖子 + 高质量 + 老账号）得分较高", () => {
      const score = computeScore(
        makeFactors({
          postCount: 20,       // +40
          highQualityPostCount: 5, // +25
          accountAgeWeeks: 20, // +20
        }),
      );
      // 100 + 40 + 25 + 20 = 185
      expect(score).toBe(185);
    });

    it("有违规的活跃用户得分被扣减", () => {
      const score = computeScore(
        makeFactors({
          postCount: 10,       // +20
          accountAgeWeeks: 10, // +10
          violationCount: 3,   // -45
        }),
      );
      // 100 + 20 + 10 - 45 = 85
      expect(score).toBe(85);
    });

    it("严重违规用户分数被钳制到 0", () => {
      const score = computeScore(
        makeFactors({
          violationCount: 5,           // -75
          resolvedReportsAgainst: 10,  // -50
          hasBanHistory: true,         // -30
        }),
      );
      // 100 - 75 - 50 - 30 = -55 → clamped to 0
      expect(score).toBe(0);
    });
  });

  // --------------------------------------------------
  // getReputationLevel
  // --------------------------------------------------
  describe("getReputationLevel", () => {
    it("0 分 → 受限", () => {
      expect(getReputationLevel(0)).toBe("受限");
    });

    it("30 分 → 受限", () => {
      expect(getReputationLevel(30)).toBe("受限");
    });

    it("31 分 → 观察", () => {
      expect(getReputationLevel(31)).toBe("观察");
    });

    it("60 分 → 观察", () => {
      expect(getReputationLevel(60)).toBe("观察");
    });

    it("61 分 → 普通", () => {
      expect(getReputationLevel(61)).toBe("普通");
    });

    it("100 分 → 普通", () => {
      expect(getReputationLevel(100)).toBe("普通");
    });

    it("101 分 → 良好", () => {
      expect(getReputationLevel(101)).toBe("良好");
    });

    it("150 分 → 良好", () => {
      expect(getReputationLevel(150)).toBe("良好");
    });

    it("151 分 → 优秀", () => {
      expect(getReputationLevel(151)).toBe("优秀");
    });

    it("200 分 → 优秀", () => {
      expect(getReputationLevel(200)).toBe("优秀");
    });
  });

  // --------------------------------------------------
  // gatherFactors (DB-backed, mocked)
  // --------------------------------------------------
  describe("gatherFactors", () => {
    it("从数据库收集用户信誉因子", async () => {
      const userId = "user-1";
      const createdAt = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000); // 21 days = 3 weeks

      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        createdAt,
        violationCount: 2,
        isBanned: false,
      });
      // post.count is called twice: once for total, once for high-quality
      mockPrisma.post.count
        .mockResolvedValueOnce(15)  // total published posts
        .mockResolvedValueOnce(3);  // high-quality posts
      mockPrisma.report.count.mockResolvedValue(1);

      const factors = await gatherFactors(userId);

      expect(factors).toEqual({
        postCount: 15,
        highQualityPostCount: 3,
        accountAgeWeeks: 3,
        violationCount: 2,
        resolvedReportsAgainst: 1,
        hasBanHistory: false,
      });
    });

    it("被封禁用户 hasBanHistory 为 true", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        createdAt: new Date(),
        violationCount: 0,
        isBanned: true,
      });
      mockPrisma.post.count.mockResolvedValue(0);
      mockPrisma.report.count.mockResolvedValue(0);

      const factors = await gatherFactors("banned-user");
      expect(factors.hasBanHistory).toBe(true);
    });
  });

  // --------------------------------------------------
  // calculateReputationScore (DB-backed, mocked)
  // --------------------------------------------------
  describe("calculateReputationScore", () => {
    it("计算并返回用户信誉分", async () => {
      const createdAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 2 weeks

      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        createdAt,
        violationCount: 0,
        isBanned: false,
      });
      mockPrisma.post.count
        .mockResolvedValueOnce(5)   // 5 posts → +10
        .mockResolvedValueOnce(1);  // 1 high-quality → +5
      mockPrisma.report.count.mockResolvedValue(0);

      const score = await calculateReputationScore("user-1");
      // 100 + 10 + 5 + 2 (2 weeks) = 117
      expect(score).toBe(117);
    });
  });

  // --------------------------------------------------
  // updateUserReputation (DB-backed, mocked)
  // --------------------------------------------------
  describe("updateUserReputation", () => {
    it("计算信誉分并保存到数据库", async () => {
      const createdAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 1 week

      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        createdAt,
        violationCount: 1,
        isBanned: false,
      });
      mockPrisma.post.count
        .mockResolvedValueOnce(10)  // 10 posts → +20
        .mockResolvedValueOnce(2);  // 2 high-quality → +10
      mockPrisma.report.count.mockResolvedValue(0);
      mockPrisma.user.update.mockResolvedValue({});

      const score = await updateUserReputation("user-1");
      // 100 + 20 + 10 + 1 (1 week) - 15 (1 violation) = 116
      expect(score).toBe(116);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { reputationScore: 116 },
      });
    });

    it("严重违规用户分数钳制到 0 并保存", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        createdAt: new Date(),
        violationCount: 10,
        isBanned: true,
      });
      mockPrisma.post.count.mockResolvedValue(0);
      mockPrisma.report.count.mockResolvedValue(5);
      mockPrisma.user.update.mockResolvedValue({});

      const score = await updateUserReputation("bad-user");
      // 100 - 150 - 25 - 30 = -105 → clamped to 0
      expect(score).toBe(0);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "bad-user" },
        data: { reputationScore: 0 },
      });
    });
  });
});
