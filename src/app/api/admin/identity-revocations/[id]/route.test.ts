import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), updateMany: vi.fn(), userUpdate: vi.fn(), audit: vi.fn(), notification: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    identityVerificationRevocationRequest: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
    user: { update: mocks.userUpdate },
  };
  return { default: { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) } };
});
vi.mock("@/lib/audit", () => ({
  AuditAction: { IDENTITY_REVOCATION_REVIEW: "IDENTITY_REVOCATION_REVIEW" },
  AuditTargetType: { IDENTITY_REVOCATION_REQUEST: "IDENTITY_REVOCATION_REQUEST" },
  logAudit: mocks.audit,
}));
vi.mock("@/lib/notification", () => ({ createNotification: mocks.notification }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { PATCH } from "./route";

describe("PATCH /api/admin/identity-revocations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", phone: "13800000000" } } as never);
    mocks.findUnique.mockResolvedValue({ id: "request-1", userId: "user-1", scope: "ALL", status: "PENDING" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.notification.mockResolvedValue({});
  });

  it("clears both badges for ALL while retaining the duplicate-prevention hash", async () => {
    const response = await PATCH(new NextRequest("http://localhost/api/admin/identity-revocations/request-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "APPROVED" }),
    }), { params: { id: "request-1" } });

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" }, data: { realVerifiedAt: null, studentVerifiedAt: null },
    });
    expect(mocks.userUpdate.mock.calls[0][0].data).not.toHaveProperty("verifiedIdentityHash");
    expect(mocks.notification).toHaveBeenCalledWith("user-1", "SYSTEM", "身份认证撤销申请已通过", expect.stringContaining("已实名和学生用户"), "/settings/identity");
  });
});
