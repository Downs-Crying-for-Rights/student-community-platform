import { describe, it, expect } from "vitest";

/**
 * CSV 工具纯函数单元测试
 *
 * 验证 CSV 字段转义、数据脱敏、行构建。
 *
 * Validates: Requirements 5.6, 5.7, 5.8
 */

import {
  escapeCsvField,
  sanitizeFormData,
  buildCsvRow,
  CSV_HEADERS,
  type CaseExportData,
} from "../csv-helpers";

import type { SensitiveMatch } from "../sensitive-engine";

/* ---------- escapeCsvField ---------- */

describe("escapeCsvField", () => {
  it("普通字符串不做转义", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  it("空字符串不做转义", () => {
    expect(escapeCsvField("")).toBe("");
  });

  it("包含逗号时用双引号包裹", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  it("包含双引号时转义为两个双引号并包裹", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("包含换行符时用双引号包裹", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("包含回车符时用双引号包裹", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });

  it("同时包含逗号和双引号时正确处理", () => {
    expect(escapeCsvField('a,"b"')).toBe('"a,""b"""');
  });
});

/* ---------- sanitizeFormData ---------- */

describe("sanitizeFormData", () => {
  it("无匹配时返回原始数据副本", () => {
    const formData = { name: "张三", subject: "数学" };
    const result = sanitizeFormData(formData, []);
    expect(result).toEqual(formData);
    expect(result).not.toBe(formData); // 应为新对象
  });

  it("替换单个敏感词", () => {
    const formData = { teacher: "张老师很好" };
    const matches: SensitiveMatch[] = [
      { word: "张老师", category: "PII" as never, startIndex: 0, endIndex: 3 },
    ];
    const result = sanitizeFormData(formData, matches);
    expect(result.teacher).toBe("[已脱敏]很好");
  });

  it("替换多个不同敏感词", () => {
    const formData = { info: "身份证号是123，手机号是456" };
    const matches: SensitiveMatch[] = [
      { word: "身份证号", category: "PII" as never, startIndex: 0, endIndex: 4 },
      { word: "手机号", category: "PII" as never, startIndex: 9, endIndex: 12 },
    ];
    const result = sanitizeFormData(formData, matches);
    expect(result.info).toContain("[已脱敏]");
    expect(result.info).not.toContain("身份证号");
    expect(result.info).not.toContain("手机号");
  });

  it("同一敏感词在值中多次出现时全部替换", () => {
    const formData = { text: "手机号是手机号" };
    const matches: SensitiveMatch[] = [
      { word: "手机号", category: "PII" as never, startIndex: 0, endIndex: 3 },
    ];
    const result = sanitizeFormData(formData, matches);
    expect(result.text).toBe("[已脱敏]是[已脱敏]");
  });

  it("跨多个字段替换敏感词", () => {
    const formData = { field1: "包含手机号", field2: "也有手机号" };
    const matches: SensitiveMatch[] = [
      { word: "手机号", category: "PII" as never, startIndex: 0, endIndex: 3 },
    ];
    const result = sanitizeFormData(formData, matches);
    expect(result.field1).toBe("包含[已脱敏]");
    expect(result.field2).toBe("也有[已脱敏]");
  });

  it("敏感词不在值中时不替换", () => {
    const formData = { clean: "干净的文本" };
    const matches: SensitiveMatch[] = [
      { word: "敏感词", category: "PII" as never, startIndex: 0, endIndex: 3 },
    ];
    const result = sanitizeFormData(formData, matches);
    expect(result.clean).toBe("干净的文本");
  });
});

/* ---------- buildCsvRow ---------- */

describe("buildCsvRow", () => {
  it("按正确字段顺序构建 CSV 行", () => {
    const data: CaseExportData = {
      id: "case1",
      category: "TUTORING",
      status: "OPENED",
      formData: '{"subject":"数学"}',
      pledgeText: "我确认",
      createdAt: "2024-01-01T00:00:00.000Z",
      submitterId: "hashed_user1",
    };
    const row = buildCsvRow(data);
    const fields = row.split(",");
    expect(fields[0]).toBe("case1");
    expect(fields[1]).toBe("TUTORING");
    expect(fields[2]).toBe("OPENED");
  });

  it("包含特殊字符的字段被正确转义", () => {
    const data: CaseExportData = {
      id: "case2",
      category: "FEES",
      status: "CLOSED",
      formData: '{"note":"a,b"}',
      pledgeText: 'say "yes"',
      createdAt: "2024-01-01T00:00:00.000Z",
      submitterId: "hashed_user2",
    };
    const row = buildCsvRow(data);
    // formData 包含逗号，应被双引号包裹
    expect(row).toContain('"');
  });

  it("CSV 头行包含正确字段", () => {
    expect(CSV_HEADERS).toBe("id,category,status,formData,pledgeText,createdAt,submitterId");
  });

  it("构建的行与头行字段数量一致", () => {
    const data: CaseExportData = {
      id: "c1",
      category: "OTHER",
      status: "IN_PROGRESS",
      formData: "{}",
      pledgeText: "ok",
      createdAt: "2024-06-01T12:00:00Z",
      submitterId: "hash123",
    };
    const row = buildCsvRow(data);
    // 无特殊字符时，逗号数量 = 字段数 - 1
    const headerCount = CSV_HEADERS.split(",").length;
    const rowCount = row.split(",").length;
    expect(rowCount).toBe(headerCount);
  });
});
