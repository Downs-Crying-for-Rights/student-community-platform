import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), send: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/sms/verification", () => ({ sendVerificationCode: mocks.send }));
vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: mocks.rateLimit,
  rateLimitKeyForIP: (ip: string) => `ip:${ip}`,
}));

function request(phone: string) {
  return new NextRequest("http://localhost:3000/api/auth/password/reset/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
}

describe("POST /api/auth/password/reset/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ success: true });
  });

  it("为已绑定账户发送独立用途验证码", async () => {
    mocks.findUnique.mockResolvedValue({ id: "user1", isBanned: false });
    const { POST } = await import("../route");
    const response = await POST(request("13800138000"));
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith("13800138000", "reset-password");
  });

  it("未知手机号返回相同成功响应但不发送验证码", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const { POST } = await import("../route");
    const response = await POST(request("13800138000"));
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain("如果该手机号已绑定账户");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
