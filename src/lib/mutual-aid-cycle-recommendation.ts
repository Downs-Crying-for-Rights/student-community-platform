export interface CycleCandidate {
  id: string;
  nickname: string | null;
  role: string;
  needText: string | null;
  offerText: string | null;
  waitingSince: string | null;
}

export interface CycleRecommendation {
  id: string;
  participants: [CycleCandidate, CycleCandidate, CycleCandidate];
  score: number;
  reasons: string[];
}

function tokens(value: string | null): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .toLowerCase()
      .split(/[\s,，。；;、/|]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  );
}

function complementScore(from: CycleCandidate, to: CycleCandidate): number {
  const offer = tokens(from.offerText);
  const need = tokens(to.needText);
  let score = 0;
  for (const item of offer) {
    if (need.has(item)) score += 8;
  }
  return Math.min(score, 24);
}

/**
 * 生成可审阅的 A→B→C→A 推荐方案。
 * 排队时间优先，其次考虑三段“可提供帮助”与下一人的“需要帮助”的关键词互补。
 */
export function buildCycleRecommendations(
  candidates: CycleCandidate[],
  limit = 5,
): CycleRecommendation[] {
  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  if (unique.length < 3) return [];

  const ordered = [...unique].sort((a, b) => {
    if (a.waitingSince && !b.waitingSince) return -1;
    if (!a.waitingSince && b.waitingSince) return 1;
    if (a.waitingSince && b.waitingSince) {
      return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
    }
    return a.id.localeCompare(b.id);
  });

  const plans: CycleRecommendation[] = [];
  for (let offset = 0; offset < ordered.length && plans.length < limit; offset += 1) {
    const participants = [
      ordered[offset % ordered.length],
      ordered[(offset + 1) % ordered.length],
      ordered[(offset + 2) % ordered.length],
    ] as [CycleCandidate, CycleCandidate, CycleCandidate];
    if (new Set(participants.map((item) => item.id)).size !== 3) continue;

    const waitingCount = participants.filter((item) => item.waitingSince).length;
    const complement = complementScore(participants[0], participants[1])
      + complementScore(participants[1], participants[2])
      + complementScore(participants[2], participants[0]);
    const reasons = [`包含 ${waitingCount} 名已提交匹配意愿的用户`];
    if (complement > 0) reasons.push(`需求与可提供帮助互补度 +${complement}`);
    if (participants.some((item) => item.role === "ADMIN" || item.role === "SUPER_ADMIN")) {
      reasons.push("包含管理员，可协助冷启动与风险兜底");
    }

    plans.push({
      id: participants.map((item) => item.id).join(":"),
      participants,
      score: waitingCount * 20 + complement,
      reasons,
    });
  }

  return plans.sort((a, b) => b.score - a.score);
}
