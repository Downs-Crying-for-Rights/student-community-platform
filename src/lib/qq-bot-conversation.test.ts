import { describe, expect, it } from "vitest";
import {
  buildCanonicalQQDraft,
  parseQQDelegationForm,
  QQ_DELEGATION_TEMPLATE,
  validateQQDelegationRequirements,
} from "./qq-bot-conversation";

const completeForm = `内容类型：学校补课
学校全称：测试高级中学
学校性质：公立学历制学校
学校类型：高级中学
详细地址：广东省广州市测试路 1 号
举报途径：020-12345 热线
行为描述：学校安排高二年级学生每周六上午八点至十二点到校统一补课。
收费情况：已收费
收费详情：每学期 1000 元，由班主任统一收取
诉求：停止补课，退还费用
其他诉求：无
涉及年级：高二
时间范围：2026 年 7 月至今，每周六 8:00-12:00
所在省份：广东省
所在城市：广州市
期望互助人省份：无
风险偏好：仅站内沟通`;

describe("QQ delegation conversation", () => {
  it("parses one complete labeled form into a stable canonical draft", () => {
    expect(QQ_DELEGATION_TEMPLATE).toContain("一次填写并发送");
    expect(QQ_DELEGATION_TEMPLATE).not.toMatch(/考核链接|AZEOi5/);

    const payload = parseQQDelegationForm(completeForm);
    expect(validateQQDelegationRequirements(payload)).toEqual([]);
    const draft = buildCanonicalQQDraft(payload);
    expect(draft.payload).toMatchObject({
      contentType: "TUTORING",
      feeStatus: "charged",
      demands: ["停止补课", "退还费用"],
      grade: "高二",
      riskPreference: "仅站内沟通",
    });
    expect(draft.hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(buildCanonicalQQDraft(payload).hash).toBe(draft.hash);
  });

  it("rejects missing, duplicate, and invalid fixed-template fields", () => {
    expect(() => parseQQDelegationForm(completeForm.replace("学校全称：测试高级中学\n", ""))).toThrow("学校全称");
    expect(() => parseQQDelegationForm(`${completeForm}\n学校全称：另一学校`)).toThrow("字段“学校全称”重复");
    expect(() => parseQQDelegationForm(completeForm.replace("收费情况：已收费", "收费情况：很多"))).toThrow("收费情况");
  });

  it("treats risk preference as optional and supports unrestricted", () => {
    const omitted = parseQQDelegationForm(completeForm.replace("风险偏好：仅站内沟通", ""));
    expect(buildCanonicalQQDraft(omitted).payload.riskPreference).toBeUndefined();

    const unrestricted = parseQQDelegationForm(completeForm.replace("风险偏好：仅站内沟通", "风险偏好：不限"));
    expect(buildCanonicalQQDraft(unrestricted).payload.riskPreference).toBe("不限");
  });

  it("requires category-specific details before AI or H5", () => {
    const tutoring = parseQQDelegationForm(completeForm.replace("涉及年级：高二", "涉及年级：无"));
    expect(validateQQDelegationRequirements(tutoring)).toContain("请填写涉及年级。");

    const earlyStart = parseQQDelegationForm(completeForm
      .replace("内容类型：学校补课", "内容类型：提前开学")
      .replace("时间范围：2026 年 7 月至今，每周六 8:00-12:00", "时间范围：2026 年 8 月"));
    expect(validateQQDelegationRequirements(earlyStart)).toContain("提前开学请明确填写规定开学日期和实际开学日期。");

    const other = parseQQDelegationForm(completeForm.replace("内容类型：学校补课", "内容类型：其他"));
    expect(validateQQDelegationRequirements(other)[0]).toContain("联系管理员");
  });
});
