import type { Role } from "@prisma/client";
import { getAccountAgeDays } from "@/lib/utils";

// ==================== Types ====================

/**
 * Minimal user attributes needed for ABAC evaluation.
 * Mirrors the relevant fields from the Prisma User model.
 */
export interface ABACUserAttributes {
  createdAt: Date | string;
  violationCount: number;
  onboardingDone: boolean;
  quizPassed: boolean;
  psychAccess: boolean;
  dcrAccess: boolean;
  dcrPledgeSigned: boolean;
  reputationScore: number;
  role: Role;
}

/**
 * Result of ABAC policy evaluation — computed restrictions and grants.
 */
export interface ABACPolicyResult {
  /** Maximum posts allowed per day (null = unlimited) */
  maxDailyPosts: number | null;
  /** Whether the user can access private zones (psychology / DCR) */
  canAccessPrivateZone: boolean;
  /** Whether the user can send direct messages */
  canSendDM: boolean;
  /** Whether the user can access the DCR zone */
  canAccessDCR: boolean;
  /** Whether the user can access the psychology zone */
  canAccessPsychology: boolean;
  /** Whether the user is considered a newcomer (account < 7 days) */
  isNewcomer: boolean;
  /** Whether the user has passed the onboarding quiz */
  hasPassedQuiz: boolean;
  /** Reasons for any active restrictions */
  restrictions: string[];
}

// ==================== Constants ====================

/** Account age threshold in days for newcomer restrictions */
export const NEWCOMER_AGE_DAYS = 7;

/** Daily post limit for newcomers (account age < 7 days) */
export const NEWCOMER_DAILY_POST_LIMIT = 3;

/** Violation count threshold that triggers stricter limits */
export const VIOLATION_THRESHOLD = 3;

/** Daily post limit for users exceeding the violation threshold */
export const VIOLATION_DAILY_POST_LIMIT = 1;

/** Minimum account age in days required for DCR access */
export const DCR_MIN_ACCOUNT_AGE_DAYS = 7;

// ==================== Policy Evaluation ====================

/**
 * Evaluate ABAC policies for a user and return computed restrictions.
 *
 * Rules applied (in priority order):
 * 1. Account age < 7 days → max 3 posts/day, no private zone, no DMs
 * 2. Violation count > 3 → max 1 post/day (overrides newcomer limit if stricter)
 * 3. Quiz not passed → limited features (no private zone access)
 * 4. DCR access requires: dcrAccess=true, dcrPledgeSigned=true, account age >= 7 days
 * 5. Psychology access requires: psychAccess=true
 */
export function evaluateABACPolicy(
  user: ABACUserAttributes,
): ABACPolicyResult {
  if (user.role === "SUPER_ADMIN") {
    return {
      maxDailyPosts: null,
      canAccessPrivateZone: true,
      canSendDM: true,
      canAccessDCR: true,
      canAccessPsychology: true,
      isNewcomer: false,
      hasPassedQuiz: true,
      restrictions: [],
    };
  }

  const accountAgeDays = getAccountAgeDays(user.createdAt);
  const isNewcomer = accountAgeDays < NEWCOMER_AGE_DAYS;
  const hasExcessiveViolations = user.violationCount > VIOLATION_THRESHOLD;

  const restrictions: string[] = [];

  // --- Daily post limit ---
  let maxDailyPosts: number | null = null;

  if (hasExcessiveViolations) {
    maxDailyPosts = VIOLATION_DAILY_POST_LIMIT;
    restrictions.push(
      `违规次数超过 ${VIOLATION_THRESHOLD} 次，每日发帖限制为 ${VIOLATION_DAILY_POST_LIMIT} 篇`,
    );
  }

  if (isNewcomer) {
    // If violation limit is already stricter, keep it; otherwise apply newcomer limit
    if (maxDailyPosts === null || NEWCOMER_DAILY_POST_LIMIT < maxDailyPosts) {
      maxDailyPosts = NEWCOMER_DAILY_POST_LIMIT;
    }
    restrictions.push(
      `账号年龄不足 ${NEWCOMER_AGE_DAYS} 天，每日发帖上限 ${NEWCOMER_DAILY_POST_LIMIT} 篇`,
    );
  }

  // --- Private zone access ---
  let canAccessPrivateZone = !isNewcomer;
  if (isNewcomer) {
    restrictions.push("新手期间禁止进入私密区");
  }

  // --- DM access ---
  let canSendDM = !isNewcomer;
  if (isNewcomer) {
    restrictions.push("新手期间禁止私信");
  }

  // --- DCR zone access ---
  const canAccessDCR =
    user.dcrAccess &&
    user.dcrPledgeSigned &&
    accountAgeDays >= DCR_MIN_ACCOUNT_AGE_DAYS;

  if (!canAccessDCR && user.dcrAccess) {
    if (!user.dcrPledgeSigned) {
      restrictions.push("未签署 DCR 私密区守则");
    }
    if (accountAgeDays < DCR_MIN_ACCOUNT_AGE_DAYS) {
      restrictions.push(
        `账号年龄不足 ${DCR_MIN_ACCOUNT_AGE_DAYS} 天，无法进入 DCR 区`,
      );
    }
  }

  // --- Psychology zone access ---
  const canAccessPsychology = user.psychAccess;

  // --- Quiz check ---
  if (!user.quizPassed) {
    restrictions.push("未通过新手测验，部分功能受限");
    // Quiz not passed further restricts private zone access
    canAccessPrivateZone = false;
  }

  return {
    maxDailyPosts,
    canAccessPrivateZone,
    canSendDM,
    canAccessDCR,
    canAccessPsychology,
    isNewcomer,
    hasPassedQuiz: user.quizPassed,
    restrictions,
  };
}

// ==================== Specific Checks ====================

/**
 * Check if a user can create a post given their daily count.
 * Returns `{ allowed: true }` or `{ allowed: false, reason: string }`.
 */
export function canCreatePost(
  user: ABACUserAttributes,
  todayPostCount: number,
): { allowed: boolean; reason?: string } {
  if (user.role === "SUPER_ADMIN") return { allowed: true };

  const policy = evaluateABACPolicy(user);

  if (
    policy.maxDailyPosts !== null &&
    todayPostCount >= policy.maxDailyPosts
  ) {
    return {
      allowed: false,
      reason: `已达每日发帖上限（${policy.maxDailyPosts} 篇）`,
    };
  }

  return { allowed: true };
}

/**
 * Check if a user can access a specific zone.
 */
export function canAccessZone(
  user: ABACUserAttributes,
  zone: "PUBLIC" | "PSYCHOLOGY" | "DCR",
): { allowed: boolean; reason?: string } {
  if (user.role === "SUPER_ADMIN") return { allowed: true };

  if (zone === "PUBLIC") {
    return { allowed: true };
  }

  const policy = evaluateABACPolicy(user);

  if (zone === "PSYCHOLOGY") {
    if (!policy.canAccessPsychology) {
      return { allowed: false, reason: "未获得心理交流区准入权限" };
    }
    return { allowed: true };
  }

  if (zone === "DCR") {
    if (!policy.canAccessDCR) {
      const reasons: string[] = [];
      if (!user.dcrAccess) reasons.push("未获得 DCR 区准入权限");
      if (!user.dcrPledgeSigned) reasons.push("未签署私密区守则");
      if (getAccountAgeDays(user.createdAt) < DCR_MIN_ACCOUNT_AGE_DAYS) {
        reasons.push(`账号年龄不足 ${DCR_MIN_ACCOUNT_AGE_DAYS} 天`);
      }
      return { allowed: false, reason: reasons.join("；") };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "未知区域" };
}
