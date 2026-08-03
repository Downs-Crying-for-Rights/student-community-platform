import { describe, expect, it } from "vitest";
import { assessPsychContentSafety, psychSafetyPriorityRank } from "../psych-moderation";

describe("psychology content moderation priority", () => {
  it("prioritizes explicit immediate self-harm intent", () => {
    expect(assessPsychContentSafety("我不想活下去了").priority).toBe("URGENT");
    expect(assessPsychContentSafety("我打算结束生命").priority).toBe("URGENT");
  });

  it("flags self-harm references for careful review", () => {
    expect(assessPsychContentSafety("最近反复出现自残念头").priority).toBe("ELEVATED");
  });

  it("does not classify ordinary emotional support content as a crisis", () => {
    expect(assessPsychContentSafety("最近考试压力很大，想听听大家怎么调节")).toEqual({
      priority: "STANDARD",
      notice: null,
    });
  });

  it("sorts urgent signals before elevated and standard content", () => {
    expect(["STANDARD", "URGENT", "ELEVATED"].sort((a, b) =>
      psychSafetyPriorityRank(a as "STANDARD" | "URGENT" | "ELEVATED")
      - psychSafetyPriorityRank(b as "STANDARD" | "URGENT" | "ELEVATED"),
    )).toEqual(["URGENT", "ELEVATED", "STANDARD"]);
  });
});
