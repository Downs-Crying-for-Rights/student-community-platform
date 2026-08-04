import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  issueProof: vi.fn(),
  markEmail: vi.fn(),
  verify: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/captcha", () => ({
  issueCaptcha: mocks.issue,
  issueCaptchaProof: mocks.issueProof,
  markEmailCaptchaVerified: mocks.markEmail,
  verifyCaptcha: mocks.verify,
}));
vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: mocks.rateLimit,
  rateLimitKeyForIP: (ip: string) => `ip:${ip}`,
  requestIP: () => "127.0.0.1",
}));

import { GET, POST } from "../route";

describe("/api/auth/captcha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.verify.mockResolvedValue(true);
    mocks.issueProof.mockResolvedValue("P".repeat(32));
  });

  it("issues a non-cacheable PNG challenge for password reset", async () => {
    mocks.issue.mockResolvedValue({ captchaId: "C".repeat(24), image: "data:image/png;base64,AA==", expiresIn: 300 });
    const response = await GET(new NextRequest("http://localhost/api/auth/captcha?purpose=password-reset"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.issue).toHaveBeenCalledWith("password-reset");
  });

  it("binds a one-time proof to its phone target", async () => {
    const response = await POST(new NextRequest("http://localhost/api/auth/captcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captchaId: "C".repeat(24), captchaCode: "AB23C", purpose: "password-reset", subject: "13800138000" }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.issueProof).toHaveBeenCalledWith("password-reset", "13800138000");
  });

  it("rejects a non-phone target for SMS-related purposes", async () => {
    const response = await POST(new NextRequest("http://localhost/api/auth/captcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captchaId: "C".repeat(24), captchaCode: "AB23C", purpose: "register", subject: "attacker@example.com" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.issueProof).not.toHaveBeenCalled();
  });
});
