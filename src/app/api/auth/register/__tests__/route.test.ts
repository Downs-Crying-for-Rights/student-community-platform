import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

vi.mock("@/lib/prisma", () => {
  const client: any = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  client.$transaction = vi.fn((callback) => callback(client));
  return { prisma: client, default: client };
});

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_password") },
}));

vi.mock("@/lib/sms/verification", () => ({ verifyCode: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { verifyCode } from "@/lib/sms/verification";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  email: "test@example.com",
  password: "password123",
  nickname: "测试用户",
  phone: "13800138000",
  code: "123456",
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCode).mockResolvedValue(true);
  });

  it("应拒绝无效参数", async () => {
    const res = await POST(makeRequest({ email: "bad" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("参数校验失败");
  });

  it("邮箱已注册时应返回 409", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("该邮箱已被注册");
  });

  it("手机号验证码正确时成功注册", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "new-user-id" } as never);

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toEqual({
      success: true,
      message: "注册成功",
      userId: "new-user-id",
    });
    expect(verifyCode).toHaveBeenCalledWith("13800138000", "123456", "register");
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "test@example.com",
        passwordHash: "hashed_password",
        nickname: "测试用户",
        phone: "13800138000",
        profileCompletionRequired: true,
      },
    });
  });

  it("无需手机号即可使用邮箱注册", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "email-user-id" } as never);

    const { phone, code, ...emailBody } = validBody;
    const res = await POST(makeRequest(emailBody));

    expect(res.status).toBe(201);
    expect(verifyCode).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "test@example.com",
        passwordHash: "hashed_password",
        nickname: "测试用户",
        profileCompletionRequired: true,
      },
    });
  });

  it("验证码错误时不创建账号", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(verifyCode).mockResolvedValue(false);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("验证码错误或已过期");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("不再创建与 JWT 策略不兼容的数据库 Session cookie", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "new-user-id" } as never);

    const res = await POST(makeRequest(validBody));

    expect(res.cookies.get("next-auth.session-token")).toBeUndefined();
  });

  it("应使用 bcrypt 哈希密码", async () => {
    const bcrypt = await import("bcryptjs");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "u1" } as never);

    await POST(makeRequest(validBody));

    expect(bcrypt.default.hash).toHaveBeenCalledWith("password123", 10);
  });
});
