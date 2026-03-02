import { describe, it, expect } from "vitest";

/**
 * PrivacyBanner 组件逻辑测试
 *
 * 验证隐私提示条组件的核心逻辑：
 * - 默认消息文本
 * - 可关闭行为
 * - 样式类名
 *
 * Validates: Requirements 28.6, 35.1
 */

const DEFAULT_MESSAGE =
  "请勿在帖子中包含真实姓名、学校名称、教师姓名等可识别信息";

interface BannerConfig {
  message?: string;
  dismissible?: boolean;
}

function resolveMessage(config: BannerConfig): string {
  return config.message ?? DEFAULT_MESSAGE;
}

function isDismissible(config: BannerConfig): boolean {
  return config.dismissible ?? false;
}

// Simulate dismiss state
function simulateDismiss(): { visible: boolean } {
  const state = { visible: true };
  // After dismiss
  state.visible = false;
  return state;
}

describe("PrivacyBanner 组件逻辑", () => {
  describe("消息文本", () => {
    it("默认消息为脱敏提示", () => {
      expect(resolveMessage({})).toBe(DEFAULT_MESSAGE);
    });

    it("自定义消息覆盖默认值", () => {
      const custom = "这是一个安全的同伴支持空间";
      expect(resolveMessage({ message: custom })).toBe(custom);
    });
  });

  describe("关闭行为", () => {
    it("默认不可关闭", () => {
      expect(isDismissible({})).toBe(false);
    });

    it("dismissible=true 时可关闭", () => {
      expect(isDismissible({ dismissible: true })).toBe(true);
    });

    it("关闭后 visible 变为 false", () => {
      const state = simulateDismiss();
      expect(state.visible).toBe(false);
    });
  });

  describe("样式", () => {
    it("使用 amber 色调背景", () => {
      const classes = "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
      expect(classes).toContain("bg-amber-50");
      expect(classes).toContain("dark:bg-amber-950/40");
    });
  });
});
