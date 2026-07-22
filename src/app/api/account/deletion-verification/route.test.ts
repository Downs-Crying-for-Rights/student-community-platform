import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ user: vi.fn(), email: vi.fn(), phone: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/email-verification", () => ({ sendAccountDeletionEmailCode: mocks.email }));
vi.mock("@/lib/sms/verification", () => ({ sendVerificationCode: mocks.phone }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null), rateLimitKeyForUser: (id: string) => id }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "./route";

describe("account deletion verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1", role: "USER", phone: "13800138000" } } as never);
    mocks.user.mockResolvedValue({ email: "user@example.com", phone: "13800138000" });
    mocks.email.mockResolvedValue({ success: true });
    mocks.phone.mockResolvedValue({ success: true });
  });

  it("sends email verification by authenticated user id", async () => {
    const response = await POST(new NextRequest("http://localhost/api/account/deletion-verification", {
      method: "POST", body: JSON.stringify({ method: "email" }), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(200);
    expect(mocks.email).toHaveBeenCalledWith("user-1");
    expect(mocks.phone).not.toHaveBeenCalled();
    expect((await response.json()).destination).toBe("u***@example.com");
  });

  it("sends SMS only to the stored phone number", async () => {
    const response = await POST(new NextRequest("http://localhost/api/account/deletion-verification", {
      method: "POST", body: JSON.stringify({ method: "phone" }), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(200);
    expect(mocks.phone).toHaveBeenCalledWith("13800138000", "account-deletion");
    expect((await response.json()).destination).toBe("138****8000");
  });

  it("rejects unavailable verification methods", async () => {
    mocks.user.mockResolvedValue({ email: null, phone: "13800138000" });
    const response = await POST(new NextRequest("http://localhost/api/account/deletion-verification", {
      method: "POST", body: JSON.stringify({ method: "email" }), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(400);
    expect(mocks.email).not.toHaveBeenCalled();
  });
});
