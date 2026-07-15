import { describe, expect, it } from "vitest";
import { formatApiError } from "@/lib/api-error";

describe("formatApiError", () => {
  it("includes field-level validation messages", () => {
    expect(formatApiError({ error: "参数校验失败", details: { text: ["题目至少5字"], options: ["选项不能为空"] } }, "失败"))
      .toBe("参数校验失败（text: 题目至少5字；options: 选项不能为空）");
  });

  it("uses a fallback for invalid response bodies", () => {
    expect(formatApiError(null, "请求失败")).toBe("请求失败");
  });
});
