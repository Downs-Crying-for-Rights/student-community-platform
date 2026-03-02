import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    session: {
      create: vi.fn(),
    },
  },
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_password") },
}));

// Mock sms verification
vi.mock("@/lib/sms/verification", () => ({
  verifyCode: vi.fn(),
}));

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
  phone: "13800138000",
  code: "123456",
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 for invalid input", async () => {
    const res = await POST(makeRequest({ email: "bad" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("参数校验失败");
  });

  it("should return 409 if email already exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("该邮箱已被注册");
  });

  it("should return 409 if phone already exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "existing" } as never);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("该手机号已被其他账户绑定");
  });

  it("should return 400 if SMS code is invalid", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(verifyCode).mockResolvedValue(false);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("验证码错误或已过期");
  });

  it("should return 201 on successful registration", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(verifyCode).mockResolvedValue(true);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "new-user-id",
      email: "test@example.com",
      phone: "13800138000",
    } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("注册成功");

    // Should set session cookie
    const cookie = res.cookies.get("next-auth.session-token");
    expect(cookie).toBeDefined();
  });

  it("should hash password with bcrypt", async () => {
    const bcrypt = await import("bcryptjs");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(verifyCode).mockResolvedValue(true);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    await POST(makeRequest(validBody));

    expect(bcrypt.default.hash).toHaveBeenCalledWith("password123", 10);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "test@example.com",
        passwordHash: "hashed_password",
        phone: "13800138000",
      },
    });
  });
});
