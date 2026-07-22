import { describe, expect, it } from "vitest";
import { getSafeCallbackUrl } from "../safe-callback-url";

describe("getSafeCallbackUrl", () => {
  it.each([
    ["/", "/"],
    ["/admin/users?tab=active#top", "/admin/users?tab=active#top"],
    [null, "/"],
    ["https://evil.test", "/"],
    ["//evil.test/path", "/"],
    ["/\\evil.test", "/"],
    ["javascript:alert(1)", "/"],
  ])("maps %s to %s", (value, expected) => {
    expect(getSafeCallbackUrl(value)).toBe(expected);
  });
});
