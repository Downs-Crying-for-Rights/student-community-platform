import { describe, expect, it } from "vitest";
import {
  applyQQDelegationAnswer,
  buildCanonicalQQDraft,
  getQQDelegationPrompt,
  QQ_DELEGATION_STEPS,
} from "./qq-bot-conversation";

const answers = [
  "1",
  "测试高级中学",
  "1",
  "高级中学",
  "测试路 1 号",
  "12345 热线",
  "学校从本学期开始要求全年级每周六到校上课，涉及多个班级。",
  "2",
  "每学期 1000 元，通过班主任收取",
  "停止补课，退还费用",
  "无",
  "高二",
  "2026 年 7 月至今",
  "广东省",
  "广州市",
  "外省",
  "1",
];

describe("QQ delegation conversation", () => {
  it("collects every canonical field without a legal-confirmation step", () => {
    expect(QQ_DELEGATION_STEPS).toHaveLength(17);
    expect(QQ_DELEGATION_STEPS.some((step) => /声明|承诺|确认/.test(step.key))).toBe(false);

    let payload: Record<string, unknown> = {};
    answers.forEach((answer, step) => {
      payload = applyQQDelegationAnswer(step, payload, answer);
    });
    expect(getQQDelegationPrompt(answers.length)).toBeNull();

    const draft = buildCanonicalQQDraft(payload);
    expect(draft.payload).toMatchObject({
      contentType: "TUTORING",
      feeStatus: "charged",
      demands: ["停止补课", "退还费用"],
      grade: "高二",
      province: "广东省",
      city: "广州市",
      expectedHelperProvince: "外省",
      riskPreference: "仅站内沟通",
    });
    expect(draft.hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(buildCanonicalQQDraft(payload).hash).toBe(draft.hash);
  });

  it("rejects invalid choices, short descriptions, and missing charged-fee details", () => {
    expect(() => applyQQDelegationAnswer(0, {}, "9")).toThrow("格式不正确");
    expect(() => applyQQDelegationAnswer(6, {}, "太短")).toThrow("20-5000");
    expect(() => applyQQDelegationAnswer(8, { feeStatus: "charged" }, "无")).toThrow("必须填写");
  });
});
