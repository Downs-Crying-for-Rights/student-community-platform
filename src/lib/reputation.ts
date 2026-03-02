import prisma from "@/lib/prisma";
import { getAccountAgeDays } from "@/lib/utils";

// ==================== Types ====================

export interface ReputationFactors {
  /** Total number of published posts */
  postCount: number;
  /** Number of posts with more than 10 likes */
  highQualityPostCount: number;
  /** Account age in weeks */
  accountAgeWeeks: number;
  /** Number of violations */
  violationCount: number;
  /** Number of reports resolved against the user */
  resolvedReportsAgainst: number;
  /** Whether the user has been banned (currently or historically) */
  hasBanHistory: boolean;
}

export type ReputationLevel =
  | "受限"   // Restricted: 0-30
  | "观察"   // Observed: 31-60
  | "普通"   // Normal: 61-100
  | "良好"   // Good: 101-150
  | "优秀";  // Excellent: 151-200

// ==================== Constants ====================

export const BASE_SCORE = 100;

export const POINTS_PER_POST = 2;
export const MAX_POST_BONUS = 40;

export const POINTS_PER_HIGH_QUALITY_POST = 5;
export const MAX_HIGH_QUALITY_BONUS = 25;

export const POINTS_PER_WEEK = 1;
export const MAX_AGE_BONUS = 20;

export const PENALTY_PER_VIOLATION = -15;
export const PENALTY_PER_RESOLVED_REPORT = -5;
export const PENALTY_BAN_HISTORY = -30;

export const MIN_SCORE = 0;
export const MAX_SCORE = 200;

// ==================== Core Logic ====================

/**
 * Compute the reputation score from raw factors.
 * Pure function — no DB access, easy to test.
 */
export function computeScore(factors: ReputationFactors): number {
  let score = BASE_SCORE;

  // Positive: posts published (+2 each, max +40)
  score += Math.min(factors.postCount * POINTS_PER_POST, MAX_POST_BONUS);

  // Positive: high-quality posts with >10 likes (+5 each, max +25)
  score += Math.min(
    factors.highQualityPostCount * POINTS_PER_HIGH_QUALITY_POST,
    MAX_HIGH_QUALITY_BONUS,
  );

  // Positive: account age (+1 per week, max +20)
  score += Math.min(factors.accountAgeWeeks * POINTS_PER_WEEK, MAX_AGE_BONUS);

  // Negative: violations (-15 each)
  score += factors.violationCount * PENALTY_PER_VIOLATION;

  // Negative: resolved reports against user (-5 each)
  score += factors.resolvedReportsAgainst * PENALTY_PER_RESOLVED_REPORT;

  // Negative: ban history (-30)
  if (factors.hasBanHistory) {
    score += PENALTY_BAN_HISTORY;
  }

  // Clamp to [0, 200]
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
}

/**
 * Map a numeric reputation score to a human-readable level name.
 */
export function getReputationLevel(score: number): ReputationLevel {
  if (score <= 30) return "受限";
  if (score <= 60) return "观察";
  if (score <= 100) return "普通";
  if (score <= 150) return "良好";
  return "优秀";
}

// ==================== DB-Backed Functions ====================

/**
 * Gather reputation factors for a user from the database.
 */
export async function gatherFactors(userId: string): Promise<ReputationFactors> {
  const [user, postCount, highQualityPostCount, resolvedReportsAgainst] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          createdAt: true,
          violationCount: true,
          isBanned: true,
        },
      }),
      prisma.post.count({
        where: { authorId: userId, status: "PUBLISHED" },
      }),
      prisma.post.count({
        where: { authorId: userId, status: "PUBLISHED", likeCount: { gt: 10 } },
      }),
      prisma.report.count({
        where: {
          targetUserId: userId,
          status: "RESOLVED",
        },
      }),
    ]);

  const accountAgeWeeks = Math.floor(getAccountAgeDays(user.createdAt) / 7);

  return {
    postCount,
    highQualityPostCount,
    accountAgeWeeks,
    violationCount: user.violationCount,
    resolvedReportsAgainst,
    hasBanHistory: user.isBanned,
  };
}

/**
 * Calculate the reputation score for a user by querying the database.
 */
export async function calculateReputationScore(userId: string): Promise<number> {
  const factors = await gatherFactors(userId);
  return computeScore(factors);
}

/**
 * Calculate and persist the reputation score for a user.
 * Returns the new score.
 */
export async function updateUserReputation(userId: string): Promise<number> {
  const score = await calculateReputationScore(userId);

  await prisma.user.update({
    where: { id: userId },
    data: { reputationScore: score },
  });

  return score;
}
