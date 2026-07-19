import { describe, it, expect } from "vitest";
import { inviteRegisterSchema } from "../validators";

const validInput = {
  inviteCode: "VALID123",
  email: "test@example.com",
  password: "password123",
  nickname: "测试用户",
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

  it("不要求手机号和短信验证码", () => {
    expect(inviteRegisterSchema.safeParse(validInput).success).toBe(true);
  });
});
