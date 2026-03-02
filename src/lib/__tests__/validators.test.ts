import { describe, it, expect } from "vitest";
import { inviteCodeSchema, emailSchema } from "../validators";

describe("inviteCodeSchema", () => {
  it("应接受有效的邀请码（6-32字符）", () => {
    expect(inviteCodeSchema.safeParse("ABCDEF").success).toBe(true);
    expect(inviteCodeSchema.safeParse("INVITE-CODE-123").success).toBe(true);
    expect(inviteCodeSchema.safeParse("A".repeat(32)).success).toBe(true);
  });

  it("应拒绝过短的邀请码", () => {
    const result = inviteCodeSchema.safeParse("ABC");
    expect(result.success).toBe(false);
  });

  it("应拒绝过长的邀请码", () => {
    const result = inviteCodeSchema.safeParse("A".repeat(33));
    expect(result.success).toBe(false);
  });

  it("应拒绝空字符串", () => {
    const result = inviteCodeSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("应拒绝非字符串类型", () => {
    expect(inviteCodeSchema.safeParse(123456).success).toBe(false);
    expect(inviteCodeSchema.safeParse(null).success).toBe(false);
    expect(inviteCodeSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("应接受有效的邮箱地址", () => {
    expect(emailSchema.safeParse("user@example.com").success).toBe(true);
    expect(emailSchema.safeParse("test.user@school.edu.cn").success).toBe(true);
  });

  it("应拒绝无效的邮箱格式", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("@missing-local.com").success).toBe(false);
    expect(emailSchema.safeParse("missing-domain@").success).toBe(false);
  });

  it("应拒绝超长邮箱地址", () => {
    const longEmail = "a".repeat(250) + "@b.com";
    expect(emailSchema.safeParse(longEmail).success).toBe(false);
  });
});
