import { describe, expect, it } from "vitest";
import { computeFlowStep, type FlowState } from "../dcr-flow-helpers";

describe("computeFlowStep", () => {
  it("未通过考核时停留在步骤 1", () => {
    expect(computeFlowStep(null, false, false)).toBe(1);
    expect(computeFlowStep("OPENED", false, false)).toBe(1);
  });

  it("通过考核但尚无有效委托时进入步骤 2", () => {
    expect(computeFlowStep(null, true, false)).toBe(2);
    expect(computeFlowStep("CLOSED", true, false)).toBe(2);
  });

  it("通过考核且已提交委托时进入审核步骤 3", () => {
    expect(computeFlowStep("OPENED", true, false)).toBe(3);
    expect(computeFlowStep("NEED_MORE_INFO", true, false)).toBe(3);
    expect(computeFlowStep("IN_PROGRESS", true, false)).toBe(3);
  });

  it("获得 DCR 权限后进入步骤 4", () => {
    expect(computeFlowStep(null, false, true)).toBe(4);
    expect(computeFlowStep("IN_PROGRESS", true, true)).toBe(4);
  });
});

describe("FlowState interface", () => {
  it("支持完整的准入状态", () => {
    const state: FlowState = {
      step: 2,
      delegationCase: null,
      quizPassed: true,
      dcrAccess: false,
      rejectionReason: "信息不完整",
    };
    expect(state.step).toBe(2);
    expect(state.rejectionReason).toBe("信息不完整");
  });
});
