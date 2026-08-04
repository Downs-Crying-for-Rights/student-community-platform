import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), send: vi.fn(), rateLimit: vi.fn(), validateCaptchaProof: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/sms/verification", () => ({ sendVerificationCode: mocks.send }));
vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: mocks.rateLimit,
  rateLimitKeyForIP: (ip: string) => `ip:${ip}`,
  requestIP: (request: Request) => request.headers.get("x-real-ip") || "unknown",
}));
vi.mock("@/lib/captcha", () => ({ validateCaptchaProof: mocks.validateCaptchaProof }));

function request(phone: string) {
  return new NextRequest("http://localhost:3000/api/auth/password/reset/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "127.0.0.1" },
    body: JSON.stringify({ phone, captchaProof: "P".repeat(32) }),
  });
}

describe("POST /api/auth/password/reset/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ success: true });
    mocks.validateCaptchaProof.mockResolvedValue(true);
  });

  it("为已绑定账户发送独立用途验证码", async () => {
    mocks.findUnique.mockResolvedValue({ id: "user1", isBanned: false });
    const { POST } = await import("../route");
    const response = await POST(request("13800138000"));
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith("13800138000", "reset-password");
    expect(mocks.validateCaptchaProof).toHaveBeenCalledWith("P".repeat(32), "password-reset", "13800138000");
  });

  it("未知手机号返回相同成功响应但不发送验证码", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const { POST } = await import("../route");
    const response = await POST(request("13800138000"));
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain("如果该手机号已绑定账户");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("无效或错绑手机号的 proof 不得触发查询或发送", async () => {
    mocks.validateCaptchaProof.mockResolvedValue(false);
    const { POST } = await import("../route");
    const response = await POST(request("13800138000"));
    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
