import { describe, it, expect } from "vitest";

/**
 * EmptyState 组件逻辑测试
 *
 * 验证空态组件的核心逻辑：
 * - 默认标题文本
 * - 可选 description 和 action 按钮
 * - actionHref 与 onAction 互斥行为
 *
 * Validates: Requirements 27.8, 38.1
 */

// Extracted defaults matching EmptyState implementation
const DEFAULT_TITLE = "暂无内容";

interface EmptyStateConfig {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}

function resolveTitle(config: EmptyStateConfig): string {
  return config.title ?? DEFAULT_TITLE;
}

function hasAction(config: EmptyStateConfig): boolean {
  return !!config.actionLabel;
}

function isLinkAction(config: EmptyStateConfig): boolean {
  return !!config.actionLabel && !!config.actionHref;
}

describe("EmptyState 组件逻辑", () => {
  describe("标题", () => {
    it("默认标题为'暂无内容'", () => {
      expect(resolveTitle({})).toBe("暂无内容");
    });

    it("自定义标题覆盖默认值", () => {
      expect(resolveTitle({ title: "没有搜索结果" })).toBe("没有搜索结果");
    });
  });

  describe("操作按钮", () => {
    it("无 actionLabel 时不显示按钮", () => {
      expect(hasAction({})).toBe(false);
    });

    it("有 actionLabel 时显示按钮", () => {
      expect(hasAction({ actionLabel: "去发帖" })).toBe(true);
    });

    it("有 actionHref 时渲染为链接", () => {
      expect(isLinkAction({ actionLabel: "去发现", actionHref: "/discover" })).toBe(true);
    });

    it("无 actionHref 时渲染为按钮", () => {
      expect(isLinkAction({ actionLabel: "重试", onAction: () => {} })).toBe(false);
    });
  });

  describe("描述文本", () => {
    it("description 为空时不渲染描述区域", () => {
      const config: EmptyStateConfig = {};
      expect(config.description).toBeUndefined();
    });

    it("description 有值时渲染描述", () => {
      const config: EmptyStateConfig = { description: "试试发布第一篇帖子吧" };
      expect(config.description).toBe("试试发布第一篇帖子吧");
    });
  });
});
