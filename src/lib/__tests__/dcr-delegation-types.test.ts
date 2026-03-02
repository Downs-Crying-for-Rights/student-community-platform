import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  CONTENT_TYPE_MAP,
  SCHOOL_TYPE_OPTIONS,
  DEMAND_OPTIONS,
  DESCRIPTION_TEMPLATES,
  formatDelegation,
  type DelegationFormData,
} from "../dcr-delegation-types";

describe("dcr-delegation-types", () => {
  describe("CONTENT_TYPE_MAP", () => {
    it("maps all 5 content types to DCRCategory values", () => {
      expect(Object.keys(CONTENT_TYPE_MAP)).toHaveLength(5);
      expect(CONTENT_TYPE_MAP["学校补课类"]).toBe("TUTORING");
      expect(CONTENT_TYPE_MAP["学校提前开学类"]).toBe("EARLY_START");
      expect(CONTENT_TYPE_MAP["学校不双休类"]).toBe("NO_WEEKENDS");
      expect(CONTENT_TYPE_MAP["校外培训机构类"]).toBe("EXTERNAL_TRAINING");
      expect(CONTENT_TYPE_MAP["其他"]).toBe("OTHER");
    });
  });

  describe("SCHOOL_TYPE_OPTIONS", () => {
    it("has 3 school categories", () => {
      expect(Object.keys(SCHOOL_TYPE_OPTIONS)).toHaveLength(3);
    });

    it("公立学历制学校 has 7 school types", () => {
      const opts = SCHOOL_TYPE_OPTIONS["公立学历制学校"];
      expect(opts).toHaveLength(7);
      expect(opts).toContain("小学");
      expect(opts).toContain("普通高校");
    });

    it("私立学历制学校 has same types as 公立", () => {
      expect(SCHOOL_TYPE_OPTIONS["私立学历制学校"]).toEqual(
        SCHOOL_TYPE_OPTIONS["公立学历制学校"],
      );
    });

    it("校外培训机构 has single option", () => {
      expect(SCHOOL_TYPE_OPTIONS["校外培训机构"]).toEqual(["校外培训机构"]);
    });
  });

  describe("DEMAND_OPTIONS", () => {
    it("has 6 demand options", () => {
      expect(DEMAND_OPTIONS).toHaveLength(6);
    });

    it("includes 其他 as last option", () => {
      expect(DEMAND_OPTIONS[DEMAND_OPTIONS.length - 1]).toBe("其他");
    });
  });

  describe("DESCRIPTION_TEMPLATES", () => {
    it("has 5 templates", () => {
      expect(Object.keys(DESCRIPTION_TEMPLATES)).toHaveLength(5);
    });

    it("has templates for all expected keys", () => {
      const keys = ["补课", "提前开学", "政策允许补课但违规提前开学", "校外培训机构", "不双休"];
      for (const key of keys) {
        expect(DESCRIPTION_TEMPLATES[key]).toBeDefined();
        expect(DESCRIPTION_TEMPLATES[key].length).toBeGreaterThan(0);
      }
    });
  });

  describe("formatDelegation", () => {
    let fixedDate: Date;

    beforeEach(() => {
      fixedDate = new Date("2025-03-15T10:30:00Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const baseData: DelegationFormData = {
      contentType: "学校补课类",
      schoolName: "测试中学",
      schoolCategory: "公立学历制学校",
      schoolType: "高级中学",
      schoolAddress: "测试市测试区测试路1号",
      reportChannels: "12345热线",
      description: "该校组织学生周末补课，违反教育部门规定。",
      feeStatus: "none",
      demands: ["停止补课", "退还费用"],
    };

    it("includes 声明文本", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【声明】");
    });

    it("includes 学校名称", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【学校名称】测试中学");
    });

    it("includes 性质-类型", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【性质-类型】公立学历制学校 - 高级中学");
    });

    it("includes 地址", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【地址】测试市测试区测试路1号");
    });

    it("includes 举报途径", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【举报途径】12345热线");
    });

    it("shows 无 when reportChannels is empty", () => {
      const result = formatDelegation({ ...baseData, reportChannels: "" });
      expect(result).toContain("【举报途径】无");
    });

    it("includes 行为描述", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【行为描述】该校组织学生周末补课，违反教育部门规定。");
    });

    it("includes 收费情况 for none", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【收费情况】未收费");
    });

    it("includes 收费情况 with details for charged", () => {
      const result = formatDelegation({
        ...baseData,
        feeStatus: "charged",
        feeDetails: "每人500元",
      });
      expect(result).toContain("【收费情况】已收费（每人500元）");
    });

    it("includes 收费情况 for unknown", () => {
      const result = formatDelegation({ ...baseData, feeStatus: "unknown" });
      expect(result).toContain("【收费情况】不清楚");
    });

    it("includes 诉求列表", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【诉求】停止补课、退还费用");
    });

    it("appends otherDemand to demands", () => {
      const result = formatDelegation({
        ...baseData,
        demands: ["停止补课"],
        otherDemand: "公开道歉",
      });
      expect(result).toContain("【诉求】停止补课、公开道歉");
    });

    it("includes 生成时间", () => {
      const result = formatDelegation(baseData);
      expect(result).toContain("【生成时间】");
      // The exact time depends on local timezone, just verify the label exists
      expect(result).toMatch(/【生成时间】\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });

    it("contains all 9 required sections", () => {
      const result = formatDelegation(baseData);
      const requiredLabels = [
        "【声明】",
        "【学校名称】",
        "【性质-类型】",
        "【地址】",
        "【举报途径】",
        "【行为描述】",
        "【收费情况】",
        "【诉求】",
        "【生成时间】",
      ];
      for (const label of requiredLabels) {
        expect(result).toContain(label);
      }
    });
  });
});
