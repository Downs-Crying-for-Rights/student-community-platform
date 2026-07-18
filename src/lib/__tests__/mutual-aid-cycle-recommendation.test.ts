import { describe, expect, it } from "vitest";
import {
  buildCycleRecommendations,
  type CycleCandidate,
} from "../mutual-aid-cycle-recommendation";

function candidate(id: string, overrides: Partial<CycleCandidate> = {}): CycleCandidate {
  return {
    id,
    nickname: id,
    role: "USER",
    needText: null,
    offerText: null,
    waitingSince: null,
    ...overrides,
  };
}

describe("互助循环后台推荐", () => {
  it("不足三名候选人时不给出不可执行方案", () => {
    expect(buildCycleRecommendations([candidate("a"), candidate("b")])).toEqual([]);
  });

  it("每个方案包含互不相同的 A、B、C", () => {
    const plans = buildCycleRecommendations([
      candidate("a"), candidate("b"), candidate("c"), candidate("d"),
    ]);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(new Set(plan.participants.map((item) => item.id)).size).toBe(3);
    }
  });

  it("优先推荐已排队且需求互补的用户", () => {
    const plans = buildCycleRecommendations([
      candidate("a", { waitingSince: "2026-07-01T00:00:00.000Z", offerText: "资料整理" }),
      candidate("b", { waitingSince: "2026-07-02T00:00:00.000Z", needText: "资料整理", offerText: "经验答疑" }),
      candidate("c", { waitingSince: "2026-07-03T00:00:00.000Z", needText: "经验答疑" }),
      candidate("admin", { role: "ADMIN" }),
    ]);
    expect(plans[0].participants.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(plans[0].score).toBeGreaterThanOrEqual(76);
    expect(plans[0].reasons.join(" ")).toContain("互补度");
  });
});
