import { describe, it, expect } from "vitest";
import {
  validateTitle,
  validateContent,
  validateImages,
  validateBoard,
  validateTags,
  isPrivateZone,
  reorderImages,
  buildSensitiveHighlightSegments,
} from "../page";

/**
 * 发布页逻辑测试
 *
 * 验证发布页的核心逻辑：
 * - 标题验证（空值、最大 30 字符）
 * - 内容验证
 * - 图片数量限制（最多 9 张）
 * - 分区验证
 * - 标签数量限制（最多 5 个）
 * - 私密区判断
 * - 图片拖拽排序
 * - 敏感词高亮分段
 *
 * Validates: Requirements 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7
 */

// Helper to create mock ImageItem
function mockImage(id: string) {
  return { id, url: `blob:http://localhost/${id}`, file: new File([""], `${id}.jpg`) };
}

describe("发布页逻辑", () => {
  describe("validateTitle", () => {
    it("空标题返回错误", () => {
      expect(validateTitle("")).toBe("标题不能为空");
      expect(validateTitle("   ")).toBe("标题不能为空");
    });

    it("有效标题返回 null", () => {
      expect(validateTitle("测试标题")).toBeNull();
      expect(validateTitle("a")).toBeNull();
    });

    it("30 字符标题有效", () => {
      const title = "一".repeat(30);
      expect(validateTitle(title)).toBeNull();
    });

    it("超过 30 字符标题返回错误", () => {
      const title = "一".repeat(31);
      expect(validateTitle(title)).toBe("标题不能超过 30 个字符");
    });
  });

  describe("validateContent", () => {
    it("空内容返回错误", () => {
      expect(validateContent("")).toBe("内容不能为空");
      expect(validateContent("   ")).toBe("内容不能为空");
    });

    it("有效内容返回 null", () => {
      expect(validateContent("这是正文内容")).toBeNull();
    });

    it("超过 10000 字符返回错误", () => {
      const content = "a".repeat(10001);
      expect(validateContent(content)).toBe("内容不能超过 10000 个字符");
    });
  });

  describe("validateImages", () => {
    it("空数组有效", () => {
      expect(validateImages([])).toBeNull();
    });

    it("9 张图片有效", () => {
      const images = Array.from({ length: 9 }, (_, i) => mockImage(`img-${i}`));
      expect(validateImages(images)).toBeNull();
    });

    it("超过 9 张图片返回错误", () => {
      const images = Array.from({ length: 10 }, (_, i) => mockImage(`img-${i}`));
      expect(validateImages(images)).toBe("最多上传 9 张图片");
    });
  });

  describe("validateBoard", () => {
    it("空分区返回错误", () => {
      expect(validateBoard("")).toBe("请选择分区");
    });

    it("有效分区返回 null", () => {
      expect(validateBoard("board-123")).toBeNull();
    });
  });

  describe("validateTags", () => {
    it("空标签数组有效", () => {
      expect(validateTags([])).toBeNull();
    });

    it("5 个标签有效", () => {
      expect(validateTags(["1", "2", "3", "4", "5"])).toBeNull();
    });

    it("超过 5 个标签返回错误", () => {
      expect(validateTags(["1", "2", "3", "4", "5", "6"])).toBe("最多选择 5 个标签");
    });
  });

  describe("isPrivateZone", () => {
    it("PSYCHOLOGY 是私密区", () => {
      expect(isPrivateZone("PSYCHOLOGY")).toBe(true);
    });

    it("DCR 是私密区", () => {
      expect(isPrivateZone("DCR")).toBe(true);
    });

    it("PUBLIC 不是私密区", () => {
      expect(isPrivateZone("PUBLIC")).toBe(false);
    });
  });

  describe("reorderImages", () => {
    const images = [mockImage("a"), mockImage("b"), mockImage("c")];

    it("将第一张移到最后", () => {
      const result = reorderImages(images, 0, 2);
      expect(result.map((i) => i.id)).toEqual(["b", "c", "a"]);
    });

    it("将最后一张移到第一", () => {
      const result = reorderImages(images, 2, 0);
      expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);
    });

    it("相同位置不变", () => {
      const result = reorderImages(images, 1, 1);
      expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
    });

    it("无效索引返回原数组", () => {
      expect(reorderImages(images, -1, 0)).toBe(images);
      expect(reorderImages(images, 0, 5)).toBe(images);
    });

    it("不修改原数组", () => {
      const original = [...images];
      reorderImages(images, 0, 2);
      expect(images.map((i) => i.id)).toEqual(original.map((i) => i.id));
    });
  });

  describe("buildSensitiveHighlightSegments", () => {
    it("无匹配返回整段文本", () => {
      const result = buildSensitiveHighlightSegments("hello world", []);
      expect(result).toEqual([{ text: "hello world", isSensitive: false }]);
    });

    it("单个匹配正确分段", () => {
      const result = buildSensitiveHighlightSegments("hello bad world", [
        { word: "bad", category: "PROFANITY", startIndex: 6, endIndex: 9 },
      ]);
      expect(result).toEqual([
        { text: "hello ", isSensitive: false },
        { text: "bad", isSensitive: true },
        { text: " world", isSensitive: false },
      ]);
    });

    it("多个匹配正确分段", () => {
      const result = buildSensitiveHighlightSegments("aaa bbb ccc", [
        { word: "aaa", category: "PII", startIndex: 0, endIndex: 3 },
        { word: "ccc", category: "RISK", startIndex: 8, endIndex: 11 },
      ]);
      expect(result).toEqual([
        { text: "aaa", isSensitive: true },
        { text: " bbb ", isSensitive: false },
        { text: "ccc", isSensitive: true },
      ]);
    });

    it("开头匹配", () => {
      const result = buildSensitiveHighlightSegments("bad text", [
        { word: "bad", category: "PROFANITY", startIndex: 0, endIndex: 3 },
      ]);
      expect(result).toEqual([
        { text: "bad", isSensitive: true },
        { text: " text", isSensitive: false },
      ]);
    });

    it("结尾匹配", () => {
      const result = buildSensitiveHighlightSegments("text bad", [
        { word: "bad", category: "PROFANITY", startIndex: 5, endIndex: 8 },
      ]);
      expect(result).toEqual([
        { text: "text ", isSensitive: false },
        { text: "bad", isSensitive: true },
      ]);
    });

    it("乱序匹配按位置排序", () => {
      const result = buildSensitiveHighlightSegments("aaa bbb ccc", [
        { word: "ccc", category: "RISK", startIndex: 8, endIndex: 11 },
        { word: "aaa", category: "PII", startIndex: 0, endIndex: 3 },
      ]);
      expect(result).toEqual([
        { text: "aaa", isSensitive: true },
        { text: " bbb ", isSensitive: false },
        { text: "ccc", isSensitive: true },
      ]);
    });
  });
});
