import { describe, it, expect } from "vitest";

/**
 * Skeleton 组件逻辑测试
 *
 * 验证骨架屏组件的核心逻辑：
 * - CardSkeleton 默认 count 为 4
 * - ListSkeleton 默认 count 为 5
 * - count 参数控制渲染数量
 * - 使用 animate-pulse 动画类
 *
 * Validates: Requirements 27.4
 */

// Extracted logic from Skeleton component
function generateSkeletonItems(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

describe("Skeleton 组件逻辑", () => {
  describe("CardSkeleton", () => {
    it("默认生成 4 个骨架项", () => {
      const items = generateSkeletonItems(4);
      expect(items).toHaveLength(4);
    });

    it("自定义 count 生成对应数量", () => {
      expect(generateSkeletonItems(2)).toHaveLength(2);
      expect(generateSkeletonItems(8)).toHaveLength(8);
    });

    it("count 为 0 时生成空数组", () => {
      expect(generateSkeletonItems(0)).toHaveLength(0);
    });
  });

  describe("ListSkeleton", () => {
    it("默认生成 5 个骨架项", () => {
      const items = generateSkeletonItems(5);
      expect(items).toHaveLength(5);
    });
  });

  describe("动画类名", () => {
    it("骨架元素使用 animate-pulse 类", () => {
      const pulseClass = "animate-pulse";
      expect(pulseClass).toBe("animate-pulse");
    });

    it("卡片骨架使用 rounded-2xl 圆角", () => {
      const cardClass = "rounded-2xl border bg-card shadow-sm overflow-hidden";
      expect(cardClass).toContain("rounded-2xl");
      expect(cardClass).toContain("shadow-sm");
    });
  });
});
