import type { Role } from "@prisma/client";
import { getAccountAgeDays } from "@/lib/utils";
import { computeTrustLevel, getDailyPostLimit, canPostInPsychology, canSendDM as tlCanSendDM, type TrustLevel } from "@/lib/trust-level";
import { evaluateDcrAdmission } from "@/lib/dcr-admission-policy";

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
  /** Whether the user is considered a newcomer (account < 7 days / trustLevel < 2) */
  isNewcomer: boolean;
  /** Whether the user has passed the onboarding quiz */
  hasPassedQuiz: boolean;
  /** Current trust level (0-5) */
  trustLevel: TrustLevel;
  /** Reasons for any active restrictions */
  restrictions: string[];
}

// ==================== Constants ====================

/** Account age threshold in days for newcomer restrictions (legacy, now covered by trustLevel) */
export const NEWCOMER_AGE_DAYS = 7;

/** Daily post limit for newcomers (account age < 7 days) — legacy, now trustLevel-based */
export const NEWCOMER_DAILY_POST_LIMIT = 3;

/** Violation count threshold that triggers stricter limits */
export const VIOLATION_THRESHOLD = 3;

/** Daily post limit for users exceeding the violation threshold */
export const VIOLATION_DAILY_POST_LIMIT = 1;

/** Minimum account age in days required for DCR access */
export const DCR_MIN_ACCOUNT_AGE_DAYS = 1; // lowered from 7; trustLevel handles the gating

// ==================== Policy Evaluation ====================

/**
 * Evaluate ABAC policies for a user and return computed restrictions.
 *
 * New trustLevel-based rules (replaces raw account-age / violation gating):
 * 1. SUPER_ADMIN / ADMIN bypass all restrictions
 * 2. trustLevel 0: 1 post/day, no private zone, no DM, no psychology posting
 * 3. trustLevel 1: 2 posts/day, no DM, no DCR
 * 4. trustLevel 2+: psychology browsing, DM unlocked, DCR application eligible
 * 5. trustLevel 3+: psychology posting, DCR access
 * 6. Violation count > 3 → caps max posts to 1/day regardless of trustLevel
 */
export function evaluateABACPolicy(
  user: ABACUserAttributes,
): ABACPolicyResult {
  // Admin bypass
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
    return {
      maxDailyPosts: null,
      canAccessPrivateZone: true,
      canSendDM: true,
      canAccessDCR: true,
      canAccessPsychology: true,
      isNewcomer: false,
      hasPassedQuiz: true,
      trustLevel: 5 as TrustLevel,
      restrictions: [],
    };
  }

  const accountAgeDays = getAccountAgeDays(user.createdAt);
  const trustLevel = computeTrustLevel(user.reputationScore);
  const isNewcomer = trustLevel < 2;
  const hasExcessiveViolations = user.violationCount > VIOLATION_THRESHOLD;

  const restrictions: string[] = [];

  // --- Daily post limit (trustLevel-based, overridden by violations) ---
  let maxDailyPosts = getDailyPostLimit(trustLevel);

  if (hasExcessiveViolations && (maxDailyPosts === null || VIOLATION_DAILY_POST_LIMIT < maxDailyPosts)) {
    maxDailyPosts = VIOLATION_DAILY_POST_LIMIT;
    restrictions.push(
      `违规次数超过 ${VIOLATION_THRESHOLD} 次，每日发帖限制为 ${VIOLATION_DAILY_POST_LIMIT} 篇`,
    );
  }

  if (trustLevel < 2) {
    restrictions.push(
      `信任等级 ${trustLevel} (${getTrustLevelLabel(trustLevel)})，每日发帖上限 ${maxDailyPosts} 篇`,
    );
  }

  // --- Private zone access ---
  const canAccessPrivateZone = trustLevel >= 2;
  if (!canAccessPrivateZone) {
    restrictions.push("信任等级不足，禁止进入私密区 (需 L2+)");
  }

  // --- DM access (trustLevel-based) ---
  const canSendDM = tlCanSendDM(trustLevel, accountAgeDays);
  if (!canSendDM) {
    restrictions.push("信任等级不足，禁止发送私信 (需 L1+)");
  }

  // --- DCR zone access（委托给统一准入策略） ---
  const dcrDecision = evaluateDcrAdmission({
    stage: "USE_DCR",
    user: {
      id: "abac-user",
      role: user.role,
      createdAt: user.createdAt,
      quizPassed: user.quizPassed,
      reputationScore: user.reputationScore,
      violationCount: user.violationCount,
      dcrAccess: user.dcrAccess,
      dcrPledgeSigned: user.dcrPledgeSigned,
    },
  });
  const canAccessDCR = dcrDecision.allowed;
  if (!dcrDecision.allowed && user.dcrAccess) {
    restrictions.push(dcrDecision.reason);
  }

  // --- Psychology zone access ---
  const canAccessPsychology = canPostInPsychology(trustLevel, user.psychAccess);
  if (!canAccessPsychology) {
    restrictions.push("未获得心理交流区准入权限");
  }

  return {
    maxDailyPosts,
    canAccessPrivateZone,
    canSendDM,
    canAccessDCR,
    canAccessPsychology,
    isNewcomer,
    hasPassedQuiz: user.quizPassed,
    trustLevel,
    restrictions,
  };
}

// Re-export helpers
import { getTrustLevelLabel } from "@/lib/trust-level";
export { computeTrustLevel, getTrustLevelLabel } from "@/lib/trust-level";
export type { TrustLevel } from "@/lib/trust-level";

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
    const decision = evaluateDcrAdmission({
      stage: "USE_DCR",
      user: {
        id: "zone-user",
        role: user.role,
        createdAt: user.createdAt,
        quizPassed: user.quizPassed,
        reputationScore: user.reputationScore,
        violationCount: user.violationCount,
        dcrAccess: user.dcrAccess,
        dcrPledgeSigned: user.dcrPledgeSigned,
      },
    });
    return decision.allowed
      ? { allowed: true }
      : { allowed: false, reason: decision.reason };
  }

  return { allowed: false, reason: "未知区域" };
}
