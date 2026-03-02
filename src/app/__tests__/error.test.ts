import { describe, it, expect, vi } from "vitest";
import React from "react";

/**
 * 500 Error page tests
 *
 * Validates: Requirements 37.6, 38.4
 */

describe("500 Error 页面", () => {
  it("模块可以正常导入", async () => {
    const mod = await import("../error");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("接受 error 和 reset props 并返回 JSX", async () => {
    const mod = await import("../error");
    const ErrorPage = mod.default;
    const result = ErrorPage({ error: new Error("test"), reset: vi.fn() });
    expect(result).toBeDefined();
    expect(result.type).toBe("div");
  });

  it("渲染包含'服务器错误'标题", async () => {
    const mod = await import("../error");
    const result = mod.default({ error: new Error("test"), reset: vi.fn() });
    const children = result.props.children as React.ReactElement[];

    const h1 = children.find(
      (child: React.ReactElement) => child?.type === "h1"
    );
    expect(h1).toBeDefined();
    expect((h1 as React.ReactElement).props.children).toBe("服务器错误");
  });

  it("重试按钮点击时调用 reset 函数", async () => {
    const mod = await import("../error");
    const mockReset = vi.fn();
    const result = mod.default({ error: new Error("test"), reset: mockReset });
    const children = result.props.children as React.ReactElement[];

    // Find the button group div (contains flex gap)
    const buttonGroup = children.find(
      (child: React.ReactElement) =>
        child?.type === "div" &&
        typeof child?.props?.className === "string" &&
        child.props.className.includes("flex gap")
    );
    expect(buttonGroup).toBeDefined();

    // First child is the retry button
    const retryButton = (buttonGroup as React.ReactElement).props
      .children[0] as React.ReactElement;
    expect(retryButton.props.children).toBe("重试");

    // Simulate click
    retryButton.props.onClick();
    expect(mockReset).toHaveBeenCalledOnce();
  });

  it("包含返回首页链接", async () => {
    const mod = await import("../error");
    const result = mod.default({ error: new Error("test"), reset: vi.fn() });
    const children = result.props.children as React.ReactElement[];

    const buttonGroup = children.find(
      (child: React.ReactElement) =>
        child?.type === "div" &&
        typeof child?.props?.className === "string" &&
        child.props.className.includes("flex gap")
    );

    const homeButton = (buttonGroup as React.ReactElement).props
      .children[1] as React.ReactElement;
    const link = homeButton.props.children as React.ReactElement;
    expect(link.props.href).toBe("/");
    expect(link.props.children).toBe("返回首页");
  });

  it("包含装饰性插画 emoji 且标记为 aria-hidden", async () => {
    const mod = await import("../error");
    const result = mod.default({ error: new Error("test"), reset: vi.fn() });
    const children = result.props.children as React.ReactElement[];

    const illustration = children.find(
      (child: React.ReactElement) => child?.props?.["aria-hidden"] === "true"
    );
    expect(illustration).toBeDefined();
    expect((illustration as React.ReactElement).props.children).toBe("⚠️");
  });
});
