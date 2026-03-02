import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * 响应式布局验证测试
 *
 * Validates: Requirements 23.1, 23.2, 23.3, 23.4, 23.5, 23.6
 *
 * Since the test environment is Node (no jsdom), we use static source analysis
 * to verify that all responsive layout CSS classes are correctly applied:
 * - Mobile-first layout with bottom navigation
 * - Desktop sidebar replacing bottom nav at lg breakpoint
 * - Touch-friendly 44x44px minimum targets
 * - Post detail max-w-2xl constraint
 * - Card styling consistency (rounded-2xl, shadow-sm, p-4)
 * - WaterfallGrid responsive gap
 */

const SRC_DIR = path.resolve(__dirname, "..");

function readSourceFile(relativePath: string): string {
  const fullPath = path.join(SRC_DIR, relativePath);
  return fs.readFileSync(fullPath, "utf-8");
}

// ==================== Tests ====================

describe("响应式布局验证", () => {
  describe("移动端优先布局 — BottomNav", () => {
    const source = readSourceFile("components/layout/BottomNav.tsx");

    it("BottomNav 应在移动端可见、PC 端隐藏 (lg:hidden)", () => {
      expect(source).toContain("lg:hidden");
    });

    it("BottomNav 应固定在底部 (fixed bottom-0)", () => {
      expect(source).toContain("fixed");
      expect(source).toContain("bottom-0");
    });

    it("BottomNav 导航项应有 44x44px 最小触摸目标", () => {
      expect(source).toContain("min-h-[44px]");
      expect(source).toContain("min-w-[44px]");
    });

    it("BottomNav 应包含五个导航入口", () => {
      const hrefMatches = source.match(/href:\s*"/g);
      expect(hrefMatches).not.toBeNull();
      expect(hrefMatches!.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("移动端优先布局 — TopBar", () => {
    const source = readSourceFile("components/layout/TopBar.tsx");

    it("TopBar 应为粘性定位 (sticky top-0)", () => {
      expect(source).toContain("sticky");
      expect(source).toContain("top-0");
    });

    it("TopBar 按钮应有 44x44px 最小触摸目标", () => {
      expect(source).toContain("min-h-[44px]");
      expect(source).toContain("min-w-[44px]");
    });

    it("TopBar 应有高层级 z-index (z-50)", () => {
      expect(source).toContain("z-50");
    });
  });

  describe("PC 端布局 — Sidebar (>= 1024px)", () => {
    const source = readSourceFile("components/layout/Sidebar.tsx");

    it("Sidebar 应在移动端隐藏、PC 端显示 (hidden lg:flex)", () => {
      expect(source).toContain("hidden");
      expect(source).toContain("lg:flex");
    });

    it("Sidebar 应有固定宽度 w-60", () => {
      expect(source).toContain("w-60");
    });

    it("Sidebar 应固定定位 (fixed)", () => {
      expect(source).toContain("fixed");
    });

    it("Sidebar 导航项应有 44px 最小高度触摸目标", () => {
      expect(source).toContain("min-h-[44px]");
    });
  });

  describe("PC 端主内容区域偏移 (lg:ml-60)", () => {
    it("首页主内容区域应有 lg:ml-60 偏移", () => {
      const source = readSourceFile("app/page.tsx");
      expect(source).toContain("lg:ml-60");
    });

    it("发现页主内容区域应有 lg:ml-60 偏移", () => {
      const source = readSourceFile("app/discover/page.tsx");
      expect(source).toContain("lg:ml-60");
    });

    it("搜索页主内容区域应有 lg:ml-60 偏移", () => {
      const source = readSourceFile("app/search/page.tsx");
      expect(source).toContain("lg:ml-60");
    });

    it("消息页主内容区域应有 lg:ml-60 偏移", () => {
      const source = readSourceFile("app/messages/page.tsx");
      expect(source).toContain("lg:ml-60");
    });

    it("设置页主内容区域应有 lg:ml-60 偏移", () => {
      const source = readSourceFile("app/settings/profile/page.tsx");
      expect(source).toContain("lg:ml-60");
    });
  });

  describe("帖子详情页宽度限制", () => {
    const source = readSourceFile("app/post/[id]/page.tsx");

    it("帖子详情页应有 max-w-2xl 宽度限制", () => {
      expect(source).toContain("max-w-2xl");
    });

    it("帖子详情页骨架屏也应有 max-w-2xl 宽度限制", () => {
      // The skeleton function also uses max-w-2xl
      const skeletonMatch = source.match(
        /function\s+PostDetailSkeleton[\s\S]*?^}/m
      );
      expect(skeletonMatch).not.toBeNull();
      expect(skeletonMatch![0]).toContain("max-w-2xl");
    });

    it("帖子详情页底部操作栏应有 max-w-2xl 宽度限制", () => {
      // The fixed bottom action bar also constrains to max-w-2xl
      expect(source).toMatch(/max-w-2xl.*items-center.*justify-around/s);
    });
  });

  describe("卡片组件样式一致性 — PostCard", () => {
    const source = readSourceFile("components/feed/PostCard.tsx");

    it("PostCard 应使用统一圆角 rounded-2xl", () => {
      expect(source).toContain("rounded-2xl");
    });

    it("PostCard 应使用轻柔阴影 shadow-sm", () => {
      expect(source).toContain("shadow-sm");
    });

    it("PostCard 内容区域应有充足留白 p-4", () => {
      expect(source).toContain("p-4");
    });

    it("PostCard 应有 hover 阴影增强效果", () => {
      expect(source).toContain("group-hover:shadow-md");
    });
  });

  describe("WaterfallGrid 响应式布局", () => {
    const source = readSourceFile("components/feed/WaterfallGrid.tsx");

    it("基础布局应为 2 列 (columns-2)", () => {
      expect(source).toContain("columns-2");
    });

    it("移动端间距应为 gap-3", () => {
      expect(source).toContain("gap-3");
    });

    it("PC 端间距应增大 (md:gap-4)", () => {
      expect(source).toContain("md:gap-4");
    });

    it("子元素应防止被列分割 (break-inside-avoid)", () => {
      expect(source).toContain("break-inside-avoid");
    });
  });
});
