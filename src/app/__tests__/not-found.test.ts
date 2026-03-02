import { describe, it, expect } from "vitest";
import React from "react";

/**
 * 404 Not Found page tests
 *
 * Validates: Requirements 37.5, 38.2
 */

describe("404 Not Found 页面", () => {
  it("模块可以正常导入", async () => {
    const mod = await import("../not-found");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("默认导出是一个 React 组件函数", async () => {
    const mod = await import("../not-found");
    const NotFound = mod.default;
    const result = NotFound();
    expect(result).toBeDefined();
    expect(result.type).toBe("div");
  });

  it("渲染包含'页面未找到'标题", async () => {
    const mod = await import("../not-found");
    const result = mod.default();
    const children = result.props.children as React.ReactElement[];

    const h1 = children.find(
      (child: React.ReactElement) => child?.type === "h1"
    );
    expect(h1).toBeDefined();
    expect((h1 as React.ReactElement).props.children).toBe("页面未找到");
  });

  it("包含描述文本", async () => {
    const mod = await import("../not-found");
    const result = mod.default();
    const children = result.props.children as React.ReactElement[];

    const p = children.find(
      (child: React.ReactElement) => child?.type === "p"
    );
    expect(p).toBeDefined();
    expect((p as React.ReactElement).props.children).toContain("不存在");
  });

  it("包含返回首页链接", async () => {
    const mod = await import("../not-found");
    const result = mod.default();
    const children = result.props.children as React.ReactElement[];

    // Find the Button wrapper (has asChild prop)
    const button = children.find(
      (child: React.ReactElement) => child?.props?.asChild
    );
    expect(button).toBeDefined();

    const link = (button as React.ReactElement).props.children;
    expect(link.props.href).toBe("/");
    expect(link.props.children).toBe("返回首页");
  });

  it("包含装饰性插画 emoji 且标记为 aria-hidden", async () => {
    const mod = await import("../not-found");
    const result = mod.default();
    const children = result.props.children as React.ReactElement[];

    const illustration = children.find(
      (child: React.ReactElement) => child?.props?.["aria-hidden"] === "true"
    );
    expect(illustration).toBeDefined();
    expect((illustration as React.ReactElement).props.children).toBe("🔍");
  });
});
