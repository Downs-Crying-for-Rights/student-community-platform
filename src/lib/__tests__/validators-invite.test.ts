import { describe, it, expect } from "vitest";
import { inviteRegisterSchema } from "../validators";

const validInput = {
  inviteCode: "VALID123",
  email: "test@example.com",
  password: "password123",
  phone: "13800138000",
  code: "123456",
};

describe("inviteRegisterSchema", () => {
  it("所有字段合法时校验通过", () => {
    const result = inviteRegisterSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("缺少 inviteCode 时校验失败", () => {
    const { inviteCode, ...rest } = validInput;
    const result = inviteRegisterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("缺少 email 时校验失败", () => {
    const { email, ...rest } = validInput;
    const result = inviteRegisterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("缺少 password 时校验失败", () => {
    const { password, ...rest } = validInput;
    const result = inviteRegisterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("缺少 phone 时校验失败", () => {
    const { phone, ...rest } = validInput;
    const result = inviteRegisterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("缺少 code 时校验失败", () => {
    const { code, ...rest } = validInput;
    const result = inviteRegisterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
