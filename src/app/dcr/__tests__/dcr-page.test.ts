import { describe, it, expect } from "vitest";
import DCREntryPage from "../page";

/**
 * DCR 入口页面逻辑测试
 *
 * 页面已被重构为纯 UI 卡片布局，不导出业务纯函数。
 * 此测试仅验证组件可正常导入。
 */

describe("DCR 入口页面", () => {
  it("页面组件可正常导入", () => {
    expect(DCREntryPage).toBeDefined();
  });
});
