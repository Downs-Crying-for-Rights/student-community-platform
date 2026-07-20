import { describe, expect, it } from "vitest";
import { isProfileComplete } from "@/lib/profile-completion";

describe("isProfileComplete", () => {
  it("requires nickname, avatar, and QQ number", () => {
    expect(isProfileComplete({
      nickname: "测试用户",
      avatar: "https://example.com/avatar.jpg",
      qqNumber: "12345678",
    })).toBe(true);
    expect(isProfileComplete({ nickname: "测试用户", avatar: "", qqNumber: "12345678" })).toBe(false);
    expect(isProfileComplete({ nickname: "测试用户", avatar: "https://example.com/avatar.jpg", qqNumber: "" })).toBe(false);
  });

  it("does not require a biography", () => {
    expect(isProfileComplete({
      nickname: "测试用户",
      avatar: "https://example.com/avatar.jpg",
      qqNumber: "12345678",
    })).toBe(true);
  });
});
