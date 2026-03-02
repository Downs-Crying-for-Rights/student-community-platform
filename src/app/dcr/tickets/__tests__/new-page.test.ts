import { describe, it, expect } from "vitest";

/**
 * DCR 四步发帖向导页面逻辑测试
 *
 * 验证向导页面的纯函数逻辑：
 * - 表单模板生成
 * - 表单验证
 * - 声明勾选验证
 * - 文本合并
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import {
  DCR_CATEGORIES,
  CATEGORY_META,
  WIZARD_STEPS,
  PLEDGE_STATEMENTS,
  getFormTemplate,
  validateFormData,
  validatePledges,
  combineFormText,
} from "../new/page";

/* ---------- Constants ---------- */

describe("DCR_CATEGORIES", () => {
  it("contains exactly seven categories", () => {
    expect(DCR_CATEGORIES).toHaveLength(7);
  });

  it("includes TUTORING, FEES, WEEKENDS, OTHER, EARLY_START, NO_WEEKENDS, EXTERNAL_TRAINING", () => {
    expect(DCR_CATEGORIES).toContain("TUTORING");
    expect(DCR_CATEGORIES).toContain("FEES");
    expect(DCR_CATEGORIES).toContain("WEEKENDS");
    expect(DCR_CATEGORIES).toContain("OTHER");
    expect(DCR_CATEGORIES).toContain("EARLY_START");
    expect(DCR_CATEGORIES).toContain("NO_WEEKENDS");
    expect(DCR_CATEGORIES).toContain("EXTERNAL_TRAINING");
  });
});

describe("CATEGORY_META", () => {
  it("has metadata for every category", () => {
    for (const cat of DCR_CATEGORIES) {
      const meta = CATEGORY_META[cat];
      expect(meta.label).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.icon).toBeDefined();
    }
  });
});

describe("WIZARD_STEPS", () => {
  it("has exactly four steps", () => {
    expect(WIZARD_STEPS).toHaveLength(4);
  });

  it("each step has a label", () => {
    for (const step of WIZARD_STEPS) {
      expect(step.label).toBeTruthy();
    }
  });
});

describe("PLEDGE_STATEMENTS", () => {
  it("has exactly two statements", () => {
    expect(PLEDGE_STATEMENTS).toHaveLength(2);
  });

  it("includes the PII removal statement", () => {
    const pii = PLEDGE_STATEMENTS.find((s) => s.includes("可识别个人信息"));
    expect(pii).toBeDefined();
  });

  it("includes the non-action statement", () => {
    const nonAction = PLEDGE_STATEMENTS.find((s) => s.includes("不组织"));
    expect(nonAction).toBeDefined();
    expect(nonAction).toContain("不指挥");
    expect(nonAction).toContain("不实施");
  });
});

/* ---------- getFormTemplate ---------- */

describe("getFormTemplate", () => {
  it("returns fields for TUTORING including gradeLevel and subject", () => {
    const fields = getFormTemplate("TUTORING");
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("gradeLevel");
    expect(keys).toContain("subject");
    expect(keys).toContain("description");
    expect(keys).toContain("expectation");
  });

  it("returns fields for FEES including feeType and amount", () => {
    const fields = getFormTemplate("FEES");
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("feeType");
    expect(keys).toContain("amount");
    expect(keys).toContain("description");
  });

  it("returns fields for WEEKENDS including situation", () => {
    const fields = getFormTemplate("WEEKENDS");
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("situation");
    expect(keys).toContain("description");
  });

  it("returns common fields for OTHER", () => {
    const fields = getFormTemplate("OTHER");
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("description");
    expect(keys).toContain("expectation");
  });

  it("all fields have label, placeholder, type, and required", () => {
    for (const cat of DCR_CATEGORIES) {
      const fields = getFormTemplate(cat);
      for (const field of fields) {
        expect(field.label).toBeTruthy();
        expect(field.placeholder).toBeTruthy();
        expect(["text", "textarea"]).toContain(field.type);
        expect(typeof field.required).toBe("boolean");
      }
    }
  });

  it("every category template includes description and expectation", () => {
    for (const cat of DCR_CATEGORIES) {
      const fields = getFormTemplate(cat);
      const keys = fields.map((f) => f.key);
      expect(keys).toContain("description");
      expect(keys).toContain("expectation");
    }
  });
});

/* ---------- validateFormData ---------- */

describe("validateFormData", () => {
  it("returns null when all required fields are filled", () => {
    const fields = getFormTemplate("TUTORING");
    const data = {
      gradeLevel: "高一",
      description: "某些情况",
      expectation: "希望获得帮助",
    };
    expect(validateFormData(fields, data)).toBeNull();
  });

  it("returns error message when a required field is empty", () => {
    const fields = getFormTemplate("TUTORING");
    const data = {
      gradeLevel: "",
      description: "某些情况",
      expectation: "希望获得帮助",
    };
    const result = validateFormData(fields, data);
    expect(result).toContain("年级");
  });

  it("returns error message when a required field is missing", () => {
    const fields = getFormTemplate("FEES");
    const data = {
      description: "某些情况",
      expectation: "希望获得帮助",
    };
    const result = validateFormData(fields, data);
    expect(result).toContain("收费类型");
  });

  it("allows optional fields to be empty", () => {
    const fields = getFormTemplate("TUTORING");
    const data = {
      gradeLevel: "高一",
      subject: "", // optional
      description: "某些情况",
      expectation: "希望获得帮助",
    };
    expect(validateFormData(fields, data)).toBeNull();
  });

  it("returns error for whitespace-only required fields", () => {
    const fields = getFormTemplate("OTHER");
    const data = {
      description: "   ",
      expectation: "希望获得帮助",
    };
    const result = validateFormData(fields, data);
    expect(result).toContain("事项描述");
  });
});

/* ---------- validatePledges ---------- */

describe("validatePledges", () => {
  it("returns true when all pledges are checked", () => {
    expect(validatePledges([true, true])).toBe(true);
  });

  it("returns false when any pledge is unchecked", () => {
    expect(validatePledges([true, false])).toBe(false);
    expect(validatePledges([false, true])).toBe(false);
    expect(validatePledges([false, false])).toBe(false);
  });

  it("returns false when pledges array length does not match", () => {
    expect(validatePledges([true])).toBe(false);
    expect(validatePledges([])).toBe(false);
  });
});

/* ---------- combineFormText ---------- */

describe("combineFormText", () => {
  it("combines all non-empty values with newlines", () => {
    const data = { a: "hello", b: "world" };
    expect(combineFormText(data)).toBe("hello\nworld");
  });

  it("filters out empty values", () => {
    const data = { a: "hello", b: "", c: "world" };
    expect(combineFormText(data)).toBe("hello\nworld");
  });

  it("returns empty string for empty data", () => {
    expect(combineFormText({})).toBe("");
  });
});
