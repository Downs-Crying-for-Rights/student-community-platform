import { describe, expect, it } from "vitest";
import { extractText, routeInput } from "./commands.js";

describe("routeInput", () => {
  it.each(["帮助", "状态", "新建委托", "取消", "草稿"] as const)("routes %s", (command) => {
    expect(routeInput(`  ${command}  `)).toEqual({ type: "command", command });
  });

  it("passes a binding code as an argument", () => {
    expect(routeInput("绑定 abc-123")).toEqual({ type: "command", command: "绑定", argument: "abc-123" });
  });

  it("routes a registration credential without changing it", () => {
    const credential = `qqg_${"A".repeat(43)}`;
    expect(routeInput(`注册 ${credential}`)).toEqual({ type: "command", command: "注册", argument: credential });
  });

  it("treats form answers and malformed commands as text", () => {
    expect(routeInput("这是表单答案")).toEqual({ type: "text", text: "这是表单答案" });
    expect(routeInput("状态 now")).toEqual({ type: "text", text: "状态 now" });
  });
});

describe("extractText", () => {
  it("accepts only text from segmented messages", () => {
    expect(extractText([{ type: "image", data: { file: "secret" } }, { type: "text", data: { text: "帮助" } }])).toBe("帮助");
  });

  it("removes CQ segments from string messages", () => {
    expect(extractText("[CQ:face,id=1] 状态")).toBe("状态");
  });
});
