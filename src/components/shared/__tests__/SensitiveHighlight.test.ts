import { describe, it, expect } from "vitest";
import {
  buildSegments,
  getCategoryHint,
  type SensitiveMatch,
} from "../SensitiveHighlight";

/**
 * SensitiveHighlight 组件逻辑测试
 *
 * 验证敏感词高亮组件的核心逻辑：
 * - buildSegments 正确分割文本为敏感/非敏感片段
 * - getCategoryHint 返回正确的修改提示
 * - 边界情况处理（空匹配、重叠匹配、连续匹配等）
 *
 * Validates: Requirements 29.6, 29.7, 39.3
 */

describe("SensitiveHighlight 组件逻辑", () => {
  describe("buildSegments", () => {
    it("无匹配时返回整段非敏感文本", () => {
      const segments = buildSegments("这是一段正常文本", []);
      expect(segments).toEqual([
        { text: "这是一段正常文本", isSensitive: false },
      ]);
    });

    it("单个匹配在文本中间时正确分割为三段", () => {
      const match: SensitiveMatch = {
        word: "敏感词",
        category: "PII",
        startIndex: 3,
        endIndex: 6,
      };
      // "这是一敏感词测试文本"
      const text = "这是一敏感词测试文本";
      const segments = buildSegments(text, [match]);

      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: "这是一", isSensitive: false });
      expect(segments[1]).toEqual({
        text: "敏感词",
        isSensitive: true,
        match,
      });
      expect(segments[2]).toEqual({ text: "测试文本", isSensitive: false });
    });

    it("匹配在文本开头时无前导非敏感段", () => {
      const match: SensitiveMatch = {
        word: "敏感",
        category: "RISK",
        startIndex: 0,
        endIndex: 2,
      };
      const segments = buildSegments("敏感内容后面", [match]);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        text: "敏感",
        isSensitive: true,
        match,
      });
      expect(segments[1]).toEqual({ text: "内容后面", isSensitive: false });
    });

    it("匹配在文本末尾时无尾部非敏感段", () => {
      const match: SensitiveMatch = {
        word: "敏感词",
        category: "PROFANITY",
        startIndex: 4,
        endIndex: 7,
      };
      const segments = buildSegments("前面内容敏感词", [match]);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ text: "前面内容", isSensitive: false });
      expect(segments[1]).toEqual({
        text: "敏感词",
        isSensitive: true,
        match,
      });
    });

    it("多个不重叠匹配按位置排序分割", () => {
      const matches: SensitiveMatch[] = [
        { word: "BBB", category: "PII", startIndex: 5, endIndex: 8 },
        { word: "AAA", category: "RISK", startIndex: 0, endIndex: 3 },
      ];
      // "AAA--BBB--"
      const segments = buildSegments("AAA--BBB--", matches);

      expect(segments).toHaveLength(4);
      expect(segments[0]).toEqual({
        text: "AAA",
        isSensitive: true,
        match: matches[1],
      });
      expect(segments[1]).toEqual({ text: "--", isSensitive: false });
      expect(segments[2]).toEqual({
        text: "BBB",
        isSensitive: true,
        match: matches[0],
      });
      expect(segments[3]).toEqual({ text: "--", isSensitive: false });
    });

    it("重叠匹配时跳过后续重叠部分", () => {
      const matches: SensitiveMatch[] = [
        { word: "ABCD", category: "PII", startIndex: 0, endIndex: 4 },
        { word: "CD", category: "RISK", startIndex: 2, endIndex: 4 },
      ];
      const segments = buildSegments("ABCDEF", matches);

      // "CD" overlaps with "ABCD", so it should be skipped
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        text: "ABCD",
        isSensitive: true,
        match: matches[0],
      });
      expect(segments[1]).toEqual({ text: "EF", isSensitive: false });
    });

    it("连续相邻匹配无间隔非敏感段", () => {
      const matches: SensitiveMatch[] = [
        { word: "AA", category: "PII", startIndex: 0, endIndex: 2 },
        { word: "BB", category: "RISK", startIndex: 2, endIndex: 4 },
      ];
      const segments = buildSegments("AABB", matches);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        text: "AA",
        isSensitive: true,
        match: matches[0],
      });
      expect(segments[1]).toEqual({
        text: "BB",
        isSensitive: true,
        match: matches[1],
      });
    });

    it("每个敏感段携带原始 match 元数据", () => {
      const match: SensitiveMatch = {
        word: "test",
        category: "PHISHING",
        startIndex: 0,
        endIndex: 4,
      };
      const segments = buildSegments("test", [match]);

      expect(segments[0].match).toBe(match);
      expect(segments[0].match?.category).toBe("PHISHING");
    });
  });

  describe("getCategoryHint", () => {
    it("PII 类别返回个人信息提示", () => {
      expect(getCategoryHint("PII")).toBe("请移除个人信息");
    });

    it("RISK 类别返回风险内容提示", () => {
      expect(getCategoryHint("RISK")).toBe("请修改风险内容");
    });

    it("PHISHING 类别返回诱导内容提示", () => {
      expect(getCategoryHint("PHISHING")).toBe("请移除诱导内容");
    });

    it("PROFANITY 类别返回不当用语提示", () => {
      expect(getCategoryHint("PROFANITY")).toBe("请修改不当用语");
    });

    it("未知类别返回通用提示", () => {
      expect(getCategoryHint("UNKNOWN")).toBe("请修改此内容");
    });
  });
});
