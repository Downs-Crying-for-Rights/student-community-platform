import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requestFind: vi.fn(), requestUpdateMany: vi.fn(), userCount: vi.fn(), userUpdate: vi.fn(),
  accountDelete: vi.fn(), sessionDelete: vi.fn(), grantDelete: vi.fn(), draftDelete: vi.fn(),
  conversationDelete: vi.fn(), identityDelete: vi.fn(), audit: vi.fn(), notification: vi.fn(),
  pendingDelete: vi.fn(), verificationFind: vi.fn(), verificationUpdate: vi.fn(), deleteObject: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    accountDeletionRequest: { updateMany: mocks.requestUpdateMany },
    account: { deleteMany: mocks.accountDelete }, session: { deleteMany: mocks.sessionDelete },
    qQGrant: { deleteMany: mocks.grantDelete }, qQDelegationDraft: { deleteMany: mocks.draftDelete },
    qQConversation: { deleteMany: mocks.conversationDelete }, qQIdentity: { deleteMany: mocks.identityDelete },
    pendingQQRegistration: { deleteMany: mocks.pendingDelete },
    identityVerificationApplication: { updateMany: mocks.verificationUpdate },
    user: { update: mocks.userUpdate },
  };
  return { default: {
    accountDeletionRequest: { findUnique: mocks.requestFind }, user: { count: mocks.userCount },
    identityVerificationApplication: { findMany: mocks.verificationFind },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } };
});
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/notification", () => ({ createNotification: mocks.notification }));
vi.mock("@/lib/oss", () => ({ deleteSensitiveObject: mocks.deleteObject }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "./route";

describe("account deletion review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as never);
    mocks.requestFind.mockResolvedValue({
      id: "request-1", userId: "user-1", status: "PENDING", user: { id: "user-1", role: "USER" },
    });
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.verificationFind.mockResolvedValue([]);
  });

  it("anonymizes and deactivates the user when approved", async () => {
    const response = await POST(new NextRequest("http://localhost/api/admin/account-deletions/request-1", {
      method: "POST", body: JSON.stringify({ action: "approve", note: "符合注销条件" }), headers: { "Content-Type": "application/json" },
    }), { params: { id: "request-1" } });

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({
        email: null, phone: null, passwordHash: null, nickname: "已注销用户",
        isBanned: true, dcrAccess: false, dcrContributionAccess: false,
      }),
    }));
    expect(mocks.accountDelete).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mocks.sessionDelete).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("does not allow administrators to review their own request", async () => {
    mocks.requestFind.mockResolvedValue({
      id: "request-1", userId: "admin-1", status: "PENDING", user: { id: "admin-1", role: "ADMIN" },
    });
    const response = await POST(new NextRequest("http://localhost/api/admin/account-deletions/request-1", {
      method: "POST", body: JSON.stringify({ action: "approve", note: "批准" }), headers: { "Content-Type": "application/json" },
    }), { params: { id: "request-1" } });
    expect(response.status).toBe(403);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
