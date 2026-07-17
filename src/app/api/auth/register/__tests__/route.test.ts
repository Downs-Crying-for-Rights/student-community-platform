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

import { prisma } from "@/lib/prisma";

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
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("普通注册不要求手机号和短信验证码", async () => {
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
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "test@example.com",
        passwordHash: "hashed_password",
        nickname: "测试用户",
      },
    });
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
