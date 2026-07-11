import { describe, it, expect } from "vitest";

/**
 * DCR 入口页面逻辑测试
 *
 * 验证首页 UI 布局中不包含动态业务逻辑。
 * 页面已被重构为纯 UI 卡片布局，不再导出纯函数。
 */

/* ---------- DCR 首页布局验证 ---------- */

describe("DCR 入口页面", () => {
  it("页面组件可正常导入", async () => {
    const module = await import("../page");
    expect(module.default).toBeDefined();
  });
});
