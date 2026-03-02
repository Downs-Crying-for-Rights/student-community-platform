import { describe, it, expect } from "vitest";
import { formatCounter, shouldShowControls, clampIndex } from "../ImageCarousel";

/**
 * ImageCarousel 图片轮播组件逻辑测试
 *
 * 验证轮播组件的核心逻辑：
 * - 导航索引边界钳制（prev/next 不越界）
 * - 计数器文本格式化（"1/5" 风格）
 * - 控件可见性（单图隐藏，多图显示）
 *
 * Validates: Requirements 28.2, 39.5
 */

describe("ImageCarousel 组件逻辑", () => {
  describe("formatCounter — 计数器文本", () => {
    it("第一张图片显示 '1/5'", () => {
      expect(formatCounter(0, 5)).toBe("1/5");
    });

    it("最后一张图片显示 '5/5'", () => {
      expect(formatCounter(4, 5)).toBe("5/5");
    });

    it("中间图片显示正确计数", () => {
      expect(formatCounter(2, 7)).toBe("3/7");
    });

    it("单张图片显示 '1/1'", () => {
      expect(formatCounter(0, 1)).toBe("1/1");
    });
  });

  describe("shouldShowControls — 控件可见性", () => {
    it("0 张图片时隐藏控件", () => {
      expect(shouldShowControls(0)).toBe(false);
    });

    it("1 张图片时隐藏控件", () => {
      expect(shouldShowControls(1)).toBe(false);
    });

    it("2 张图片时显示控件", () => {
      expect(shouldShowControls(2)).toBe(true);
    });

    it("多张图片时显示控件", () => {
      expect(shouldShowControls(9)).toBe(true);
    });
  });

  describe("clampIndex — 导航索引钳制", () => {
    it("索引在有效范围内时不变", () => {
      expect(clampIndex(2, 5)).toBe(2);
    });

    it("索引为 0 时保持 0", () => {
      expect(clampIndex(0, 5)).toBe(0);
    });

    it("索引为最后一个时保持不变", () => {
      expect(clampIndex(4, 5)).toBe(4);
    });

    it("索引小于 0 时钳制为 0（prev 越界）", () => {
      expect(clampIndex(-1, 5)).toBe(0);
    });

    it("索引超出上界时钳制为 total-1（next 越界）", () => {
      expect(clampIndex(5, 5)).toBe(4);
    });

    it("索引远超上界时钳制为 total-1", () => {
      expect(clampIndex(100, 3)).toBe(2);
    });

    it("total 为 0 时返回 0", () => {
      expect(clampIndex(0, 0)).toBe(0);
    });

    it("total 为 1 时始终返回 0", () => {
      expect(clampIndex(0, 1)).toBe(0);
      expect(clampIndex(1, 1)).toBe(0);
    });
  });
});
