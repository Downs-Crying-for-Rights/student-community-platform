import { describe, expect, it } from "vitest";
import { AdminWatermark } from "../AdminWatermark";

describe("AdminWatermark", () => {
  it("使用覆盖整页的固定层并重复显示管理员身份", () => {
    const element = AdminWatermark({ identity: "18888888888", date: "2026-7-17" });

    expect(element.props["data-testid"]).toBe("admin-watermark");
    expect(element.props.className).toContain("fixed");
    expect(element.props.className).toContain("inset-0");
    expect(element.props.className).toContain("pointer-events-none");
    expect(element.props.children).toHaveLength(15);
    expect(element.props.children[0].props.children).toContain("敏感内容，严禁外传");
    expect(element.props.children[0].props.children).toContain("18888888888");
  });
});
