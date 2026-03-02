import { describe, it, expect } from "vitest";
import {
  phoneSchema,
  verificationCodeSchema,
  bindPhoneSchema,
} from "@/lib/validators";

// Unit tests for 手机号绑定页面 Zod validation schemas
// **Validates: Requirements 5.2, 5.3, 5.4, 5.5**

describe("phoneSchema", () => {
  it("accepts valid 11-digit Chinese phone numbers starting with 1", () => {
    const validPhones = [
      "13800138000",
      "15912345678",
      "18600001111",
      "17700009999",
      "19988887777",
      "14500001234",
      "16600005678",
    ];
    for (const phone of validPhones) {
      expect(phoneSchema.safeParse(phone).success).toBe(true);
    }
  });

  it("rejects phone numbers that don't start with 1", () => {
    expect(phoneSchema.safeParse("23800138000").success).toBe(false);
    expect(phoneSchema.safeParse("03800138000").success).toBe(false);
    expect(phoneSchema.safeParse("93800138000").success).toBe(false);
  });

  it("rejects phone numbers with wrong length", () => {
    // Too short
    expect(phoneSchema.safeParse("1380013800").success).toBe(false);
    // Too long
    expect(phoneSchema.safeParse("138001380001").success).toBe(false);
    // Empty
    expect(phoneSchema.safeParse("").success).toBe(false);
  });

  it("rejects phone numbers containing non-digit characters", () => {
    expect(phoneSchema.safeParse("1380013800a").success).toBe(false);
    expect(phoneSchema.safeParse("138-0013-800").success).toBe(false);
    expect(phoneSchema.safeParse("138 0013 800").success).toBe(false);
    expect(phoneSchema.safeParse("+8613800138000").success).toBe(false);
  });

  it("returns the correct error message for invalid input", () => {
    const result = phoneSchema.safeParse("abc");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("请输入有效的中国大陆手机号");
    }
  });
});

describe("verificationCodeSchema", () => {
  it("accepts valid 6-digit codes", () => {
    const validCodes = ["000000", "123456", "888888", "999999", "100001"];
    for (const code of validCodes) {
      expect(verificationCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it("rejects codes with wrong length", () => {
    expect(verificationCodeSchema.safeParse("12345").success).toBe(false);
    expect(verificationCodeSchema.safeParse("1234567").success).toBe(false);
    expect(verificationCodeSchema.safeParse("").success).toBe(false);
  });

  it("rejects codes containing non-digit characters", () => {
    expect(verificationCodeSchema.safeParse("12345a").success).toBe(false);
    expect(verificationCodeSchema.safeParse("abcdef").success).toBe(false);
    expect(verificationCodeSchema.safeParse("12 345").success).toBe(false);
  });

  it("returns the correct error message for invalid input", () => {
    const result = verificationCodeSchema.safeParse("abc");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("验证码为 6 位数字");
    }
  });
});

describe("bindPhoneSchema", () => {
  it("accepts valid { phone, code } objects", () => {
    const result = bindPhoneSchema.safeParse({
      phone: "13800138000",
      code: "123456",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ phone: "13800138000", code: "123456" });
    }
  });

  it("rejects when phone is invalid", () => {
    const result = bindPhoneSchema.safeParse({
      phone: "12345",
      code: "123456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when code is invalid", () => {
    const result = bindPhoneSchema.safeParse({
      phone: "13800138000",
      code: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when both phone and code are invalid", () => {
    const result = bindPhoneSchema.safeParse({
      phone: "bad",
      code: "bad",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("rejects when phone is missing", () => {
    const result = bindPhoneSchema.safeParse({ code: "123456" });
    expect(result.success).toBe(false);
  });

  it("rejects when code is missing", () => {
    const result = bindPhoneSchema.safeParse({ phone: "13800138000" });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = bindPhoneSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
