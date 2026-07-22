import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  adminFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  audit: vi.fn(),
  notification: vi.fn(),
  verifyEmail: vi.fn(),
  verifyPhone: vi.fn(),
  notice: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const deletion = {
    findUnique: mocks.findUnique,
    upsert: mocks.upsert,
    updateMany: mocks.updateMany,
    findUniqueOrThrow: mocks.findUniqueOrThrow,
  };
  return { default: {
    accountDeletionRequest: deletion,
    user: { findMany: mocks.adminFindMany, findUnique: mocks.userFindUnique },
    $transaction: vi.fn((callback: (tx: { accountDeletionRequest: typeof deletion }) => unknown) => callback({ accountDeletionRequest: deletion })),
  } };
});
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/notification", () => ({ createNotification: mocks.notification }));
vi.mock("@/lib/account-deletion-notice", () => ({
  ACCOUNT_DELETION_NOTICE_KEY: "account_deletion_notice",
  getAccountDeletionNotice: mocks.notice,
}));
vi.mock("@/lib/email-verification", () => ({ verifyAccountDeletionEmailCode: mocks.verifyEmail }));
vi.mock("@/lib/sms/verification", () => ({ verifyCode: mocks.verifyPhone }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null), rateLimitKeyForUser: (id: string) => id }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { DELETE, POST } from "./route";

describe("account deletion request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1", role: "USER" } } as never);
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({ id: "request-1", status: "PENDING", requestedAt: new Date() });
    mocks.adminFindMany.mockResolvedValue([{ id: "admin-1" }]);
    mocks.notification.mockResolvedValue({});
    mocks.userFindUnique.mockResolvedValue({ email: "user@example.com", phone: "13800138000" });
    mocks.notice.mockResolvedValue({ revision: 3 });
    mocks.verifyEmail.mockResolvedValue(true);
    mocks.verifyPhone.mockResolvedValue(true);
  });

  it("submits a pending request and notifies administrators", async () => {
    const response = await POST(new NextRequest("http://localhost/api/account/deletion-request", {
      method: "POST", body: JSON.stringify({ reason: "不再使用", method: "email", code: "123456", noticeAccepted: true, noticeRevision: 3 }), headers: { "Content-Type": "application/json" },
    }), { params: {} });

    expect(response.status).toBe(201);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: "user-1", reason: "不再使用" },
    }));
    expect(mocks.notification).toHaveBeenCalledWith(
      "admin-1", "SYSTEM", "新的账号注销申请", expect.any(String), "/admin/account-deletions",
    );
    expect(mocks.verifyEmail).toHaveBeenCalledWith("user-1", "123456");
    expect(mocks.audit).toHaveBeenCalledWith("user-1", "ACCOUNT_DELETION_REQUEST", "ACCOUNT_DELETION_REQUEST", "request-1", expect.objectContaining({
      verificationMethod: "EMAIL", noticeRevision: 3,
    }), undefined, expect.anything());
  });

  it("rejects a duplicate pending request", async () => {
    mocks.findUnique.mockResolvedValue({ id: "request-1", status: "PENDING" });
    const response = await POST(new NextRequest("http://localhost/api/account/deletion-request", {
      method: "POST", body: JSON.stringify({ method: "phone", code: "123456", noticeAccepted: true, noticeRevision: 3 }), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid verification code", async () => {
    mocks.verifyPhone.mockResolvedValue(false);
    const response = await POST(new NextRequest("http://localhost/api/account/deletion-request", {
      method: "POST", body: JSON.stringify({ method: "phone", code: "123456", noticeAccepted: true, noticeRevision: 3 }), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("验证码错误或已过期");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a stale deletion notice revision", async () => {
    const response = await POST(new NextRequest("http://localhost/api/account/deletion-request", {
      method: "POST", body: JSON.stringify({ method: "email", code: "123456", noticeAccepted: true, noticeRevision: 2 }), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(409);
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it("requires explicit acceptance of the deletion notice", async () => {
    const response = await POST(new NextRequest("http://localhost/api/account/deletion-request", {
      method: "POST", body: JSON.stringify({ method: "email", code: "123456", noticeAccepted: false, noticeRevision: 3 }), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(400);
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it("cancels only the current user's pending request", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "request-1" });
    const response = await DELETE(new NextRequest("http://localhost/api/account/deletion-request", { method: "DELETE" }), { params: {} });
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", status: "PENDING" },
    }));
  });
});
