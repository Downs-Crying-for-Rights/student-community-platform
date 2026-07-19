import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyCode: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  hash: vi.fn(),
  rateLimit: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/sms/verification", () => ({ verifyCode: mocks.verifyCode }));
vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: mocks.rateLimit,
  rateLimitKeyForIP: (ip: string) => `ip:${ip}`,
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/audit", () => ({
  AuditAction: { PASSWORD_RESET: "PASSWORD_RESET" },
  AuditTargetType: { USER: "USER" },
  logAudit: mocks.audit,
}));
vi.mock("@/lib/prisma", () => {
  const tx = { user: { update: mocks.update }, auditLog: { create: vi.fn() } };
  return {
    default: {
      user: { findUnique: mocks.findUnique },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
  };
});

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/auth/password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  phone: "13800138000",
  code: "123456",
  password: "new-password-123",
  confirmPassword: "new-password-123",
};

describe("POST /api/auth/password/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.audit.mockResolvedValue({});
  });

  it("使用独立 reset-password 验证码重置密码并写审计", async () => {
    mocks.verifyCode.mockResolvedValue(true);
    mocks.findUnique.mockResolvedValue({ id: "user1", isBanned: false });
    const { POST } = await import("../route");
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    expect(mocks.verifyCode).toHaveBeenCalledWith("13800138000", "123456", "reset-password");
    expect(mocks.hash).toHaveBeenCalledWith("new-password-123", 10);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { passwordHash: "hashed-password", securityVersion: { increment: 1 } },
    });
    expect(mocks.audit).toHaveBeenCalledWith("user1", "PASSWORD_RESET", "USER", "user1", { method: "VERIFIED_PHONE" }, undefined, expect.anything());
  });

  it("错误验证码不能修改密码", async () => {
    mocks.verifyCode.mockResolvedValue(false);
    const { POST } = await import("../route");
    const response = await POST(request(validBody));
    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("两次密码不一致时拒绝请求", async () => {
    const { POST } = await import("../route");
    const response = await POST(request({ ...validBody, confirmPassword: "different-password" }));
    expect(response.status).toBe(400);
    expect(mocks.verifyCode).not.toHaveBeenCalled();
  });

  it("限流时不验证验证码", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ response: new Response(), result: {} });
    const { POST } = await import("../route");
    const response = await POST(request(validBody));
    expect(response.status).toBe(429);
    expect(mocks.verifyCode).not.toHaveBeenCalled();
  });
});
