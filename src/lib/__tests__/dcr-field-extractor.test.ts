import { describe, expect, it } from "vitest";
import { extractFields, hasMultipleSchools } from "@/lib/dcr-field-extractor";

describe("DCR 学校数量检测", () => {
  it("不会把格式化表单中重复的学校字段标签误判为多校", () => {
    const formatted = [
      "【学校名称】示例中学",
      "【学校性质】公办学校",
      "【学校类型】普通中学",
      "【学校地址】示例市示例区",
    ].join("\n");

    expect(hasMultipleSchools(formatted)).toBe(false);
  });

  it("能识别学校名称输入框中明确列出的多所学校", () => {
    expect(hasMultipleSchools("第一中学、第二中学")).toBe(true);
  });

  it("不会把大学附属中学误判为两所学校", () => {
    expect(hasMultipleSchools("示例大学附属中学")).toBe(false);
  });

  it("字段抽取只检查学校名称字段，不统计整份表单标签", () => {
    const result = extractFields({
      schoolName: "示例中学",
      schoolAddress: "广东省广州市示例区",
      schoolCategory: "公办学校",
      schoolType: "普通中学",
      contentType: "学校补课类",
      description: "高一学生每周六 8:30-17:30 在校补课，情况已经持续一段时间。",
      feeStatus: "none",
      reportChannels: "020-12345",
      pledgeText: "我确认以上信息真实有效，并已移除所有可识别个人信息。学校名称、学校性质、学校地址均已填写。",
    });

    expect(result.missingFields).not.toContain("多校检测");
  });
});
