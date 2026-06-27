/**
 * 信任等级 (Trust Level) 系统
 *
 * 将 reputationScore (0-200) 映射为 5 级梯度制 trustLevel (0-5)，
 * 用于控制用户在各区域的操作权限。
 *
 * 纯函数设计，无副作用，便于测试和 ABAC 集成。
 */

/* ========== Types ========== */

/** 信任等级 0-5 */
export type TrustLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface TrustLevelInfo {
  level: TrustLevel;
  label: string;
  /** 该等级的描述 */
  description: string;
}

/* ========== Constants ========== */

/** reputationScore → trustLevel 映射阈值 */
export const TRUST_LEVEL_THRESHOLDS: { maxScore: number; level: TrustLevel }[] = [
  { maxScore: 30, level: 0 },
  { maxScore: 60, level: 1 },
  { maxScore: 100, level: 2 },
  { maxScore: 150, level: 3 },
  { maxScore: 200, level: 4 },
];

export const TRUST_LEVEL_INFO: Record<TrustLevel, TrustLevelInfo> = {
  0: { level: 0, label: "新用户", description: "注册未满 7 天或信誉分 ≤ 30，仅可浏览和有限发帖" },
  1: { level: 1, label: "观察期", description: "信誉分 31-60，发帖和评论受限" },
  2: { level: 2, label: "普通用户", description: "信誉分 61-100，可发帖评论，可申请心理区" },
  3: { level: 3, label: "可信用户", description: "信誉分 101-150，心理区可发帖，可申请 DCR" },
  4: { level: 4, label: "优秀用户", description: "信誉分 151-200，所有功能开放" },
};

/**
 * 最大 trustLevel (用于 ADMIN/SUPER_ADMIN 等不受限制的角色)
 */
export const MAX_TRUST_LEVEL: TrustLevel = 5;

/* ========== Core Functions ========== */

/**
 * 将 reputationScore 映射为 trustLevel。
 *
 * - score ≤ 30  → 0 (新用户)
 * - score 31-60 → 1 (观察期)
 * - score 61-100 → 2 (普通)
 * - score 101-150 → 3 (可信)
 * - score 151-200 → 4 (优秀)
 * - 未提供 score → 0
 */
export function computeTrustLevel(reputationScore?: number | null): TrustLevel {
  if (reputationScore == null || reputationScore < 0) return 0;
  for (const { maxScore, level } of TRUST_LEVEL_THRESHOLDS) {
    if (reputationScore <= maxScore) return level;
  }
  return 4;
}

/**
 * 检查用户是否可以发帖到心理区。
 * - trustLevel ≥ 2 或 psychAccess 为 true
 */
export function canPostInPsychology(
  trustLevel: TrustLevel,
  psychAccess?: boolean,
): boolean {
  if (psychAccess) return true;
  return trustLevel >= 2;
}

/**
 * 检查用户是否可以申请 DCR 区访问。
 * - trustLevel ≥ 2 且 accountAgeDays ≥ 7
 */
export function canApplyDCR(
  trustLevel: TrustLevel,
  accountAgeDays: number,
): boolean {
  return trustLevel >= 2 && accountAgeDays >= 7;
}

/**
 * 检查用户是否可以发私信 (DM)。
 * - trustLevel ≥ 1 或 accountAgeDays ≥ 1
 */
export function canSendDM(
  trustLevel: TrustLevel,
  accountAgeDays: number,
): boolean {
  return trustLevel >= 1 || accountAgeDays >= 1;
}

/**
 * 获取信任等级对应的每日发帖上限。
 * - L0: 1 帖/天
 * - L1: 2 帖/天
 * - L2: 5 帖/天
 * - L3+: 无限制
 */
export function getDailyPostLimit(trustLevel: TrustLevel): number | null {
  const limits: Record<number, number | null> = {
    0: 1,
    1: 2,
    2: 5,
  };
  return limits[trustLevel] ?? null;
}

/**
 * 获取信任等级标签的中文名称。
 */
export function getTrustLevelLabel(level: TrustLevel): string {
  return TRUST_LEVEL_INFO[level]?.label ?? "新用户";
}
