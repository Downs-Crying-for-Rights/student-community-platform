import { describe, expect, it } from "vitest";
import {
  DCR_STEP_CTA,
  DCR_WORKSPACE_CARDS,
  getDcrCurrentStep,
  getDcrEntryMode,
  type DcrAdmissionProgress,
} from "@/components/dcr/dcr-workbench-contract";

function admission(overrides: Partial<DcrAdmissionProgress> = {}): DcrAdmissionProgress {
  return {
    accessGranted: false,
    phoneVerified: false,
    quizPassed: false,
    currentStep: "PHONE",
    linkedCase: null,
    application: null,
    blockers: [],
    ...overrides,
  };
}

describe("DCR 工作台契约", () => {
  it.each([
    [{ accessGranted: false, phoneVerified: false, quizPassed: false, hasLinkedCase: false }, "PHONE"],
    [{ accessGranted: false, phoneVerified: true, quizPassed: false, hasLinkedCase: false }, "QUIZ"],
    [{ accessGranted: false, phoneVerified: true, quizPassed: true, hasLinkedCase: false }, "CASE"],
    [{ accessGranted: false, phoneVerified: true, quizPassed: true, hasLinkedCase: true }, "REVIEW"],
    [{ accessGranted: true, phoneVerified: false, quizPassed: false, hasLinkedCase: false }, "COMPLETE"],
  ] as const)("按准入事实映射 currentStep", (input, expected) => {
    expect(getDcrCurrentStep(input)).toBe(expected);
  });

  it("quizPassed=true 后 CTA 进入委托而不是再次进入考核", () => {
    const currentStep = getDcrCurrentStep({
      accessGranted: false,
      phoneVerified: true,
      quizPassed: true,
      hasLinkedCase: false,
    });

    expect(currentStep).toBe("CASE");
    if (currentStep === "COMPLETE") throw new Error("quizPassed 不应直接完成准入");
    expect(DCR_STEP_CTA[currentStep]).toEqual({ label: "填写委托表", href: "/dcr/delegate" });
  });

  it("APPROVED application 但 accessGranted=false 仍展示准入流", () => {
    const state = admission({
      accessGranted: false,
      phoneVerified: true,
      quizPassed: true,
      currentStep: "REVIEW",
      application: {
        id: "application-1",
        status: "APPROVED",
        reviewNote: null,
        reviewedAt: "2026-07-17T00:00:00.000Z",
        createdAt: "2026-07-16T00:00:00.000Z",
        caseId: "case-1",
        caseLinkMissing: false,
      },
    });

    expect(getDcrEntryMode(state)).toBe("ADMISSION");
  });

  it("已准入工作台固定展示求助、任务、闭环三卡", () => {
    expect(getDcrEntryMode(admission({ accessGranted: true, currentStep: "COMPLETE" }))).toBe("WORKSPACE");
    expect(DCR_WORKSPACE_CARDS.map((card) => card.title)).toEqual([
      "我的求助",
      "互助任务",
      "互助闭环",
    ]);
  });
});
