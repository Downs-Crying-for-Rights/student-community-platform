export type PsychSafetyPriority = "URGENT" | "ELEVATED" | "STANDARD";

export interface PsychSafetyAssessment {
  priority: PsychSafetyPriority;
  notice: string | null;
}

const URGENT_PATTERNS = [
  /(?:想|要|准备|打算).{0,6}(?:自杀|轻生|结束生命)/,
  /不想活(?:了|下去)?/,
  /活不下去/,
  /马上.{0,4}(?:跳楼|割腕|服药过量)/,
];

const ELEVATED_PATTERNS = [
  /自残/,
  /割腕/,
  /跳楼/,
  /服药过量/,
  /伤害自己/,
  /结束生命/,
];

/**
 * Adds a human-review priority signal for psychology content. This is not a
 * diagnosis and never approves, rejects, hides, or reports content by itself.
 */
export function assessPsychContentSafety(content: string): PsychSafetyAssessment {
  const normalized = content.replace(/\s+/g, "");
  if (URGENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      priority: "URGENT",
      notice: "可能包含即时人身安全风险线索，请优先人工复核",
    };
  }
  if (ELEVATED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      priority: "ELEVATED",
      notice: "可能包含自伤相关内容，请谨慎人工复核",
    };
  }
  return { priority: "STANDARD", notice: null };
}

export function psychSafetyPriorityRank(priority: PsychSafetyPriority): number {
  if (priority === "URGENT") return 0;
  if (priority === "ELEVATED") return 1;
  return 2;
}
