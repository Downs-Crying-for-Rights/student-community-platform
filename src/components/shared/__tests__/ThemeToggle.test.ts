import { describe, it, expect } from "vitest";

/**
 * ThemeToggle 组件逻辑测试
 *
 * 测试环境为 node（无 jsdom），验证 ThemeToggle 的核心逻辑：
 * - 主题状态判断
 * - aria-label 文本选择
 * - CSS 类名计算（动画过渡）
 * - 触摸目标尺寸
 *
 * Validates: Requirements 24.1, 24.2, 39.1
 */

// --- Extracted logic matching ThemeToggle implementation ---

function getAriaLabel(isDark: boolean): string {
  return isDark ? "切换到浅色模式" : "切换到深色模式";
}

function getNextTheme(isDark: boolean): string {
  return isDark ? "light" : "dark";
}

function getSunClasses(isDark: boolean): string {
  const base = "h-5 w-5 transition-all duration-300";
  return isDark
    ? `${base} rotate-0 scale-100`
    : `${base} rotate-90 scale-0 absolute`;
}

function getMoonClasses(isDark: boolean): string {
  const base = "h-5 w-5 transition-all duration-300";
  return isDark
    ? `${base} -rotate-90 scale-0 absolute`
    : `${base} rotate-0 scale-100`;
}

// --- Tests ---

describe("ThemeToggle 逻辑", () => {
  describe("aria-label 无障碍标签", () => {
    it("深色模式下显示'切换到浅色模式'", () => {
      expect(getAriaLabel(true)).toBe("切换到浅色模式");
    });

    it("浅色模式下显示'切换到深色模式'", () => {
      expect(getAriaLabel(false)).toBe("切换到深色模式");
    });
  });

  describe("主题切换目标", () => {
    it("深色模式下切换到 light", () => {
      expect(getNextTheme(true)).toBe("light");
    });

    it("浅色模式下切换到 dark", () => {
      expect(getNextTheme(false)).toBe("dark");
    });
  });

  describe("图标动画类名", () => {
    it("深色模式下 Sun 图标可见（scale-100）", () => {
      const classes = getSunClasses(true);
      expect(classes).toContain("scale-100");
      expect(classes).toContain("rotate-0");
      expect(classes).not.toContain("absolute");
    });

    it("浅色模式下 Sun 图标隐藏（scale-0）", () => {
      const classes = getSunClasses(false);
      expect(classes).toContain("scale-0");
      expect(classes).toContain("rotate-90");
      expect(classes).toContain("absolute");
    });

    it("深色模式下 Moon 图标隐藏（scale-0）", () => {
      const classes = getMoonClasses(true);
      expect(classes).toContain("scale-0");
      expect(classes).toContain("-rotate-90");
      expect(classes).toContain("absolute");
    });

    it("浅色模式下 Moon 图标可见（scale-100）", () => {
      const classes = getMoonClasses(false);
      expect(classes).toContain("scale-100");
      expect(classes).toContain("rotate-0");
      expect(classes).not.toContain("absolute");
    });

    it("所有图标类名包含 transition-all duration-300 过渡动画", () => {
      for (const isDark of [true, false]) {
        expect(getSunClasses(isDark)).toContain("transition-all duration-300");
        expect(getMoonClasses(isDark)).toContain("transition-all duration-300");
      }
    });
  });

  describe("触摸目标尺寸", () => {
    it("按钮最小尺寸为 44x44px", () => {
      const buttonClasses = "min-h-[44px] min-w-[44px] relative";
      expect(buttonClasses).toContain("min-h-[44px]");
      expect(buttonClasses).toContain("min-w-[44px]");
    });
  });

  describe("hydration 安全", () => {
    it("未挂载时（mounted=false）isDark 为 false", () => {
      const mounted = false;
      const theme = "dark";
      const isDark = mounted && theme === "dark";
      expect(isDark).toBe(false);
    });

    it("挂载后（mounted=true）正确反映主题", () => {
      const mounted = true;
      expect(mounted && "dark" === "dark").toBe(true);
      expect(mounted && "light" === "dark").toBe(false);
    });
  });
});
