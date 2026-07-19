import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdate: vi.fn(),
  applicationUpdate: vi.fn(),
  userUpdate: vi.fn(),
  timelineCreate: vi.fn(),
  logAudit: vi.fn(),
  createNotification: vi.fn(),
  sendUserMail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    case: { findUnique: mocks.caseFindUnique, update: mocks.caseUpdate },
    accessApplication: { update: mocks.applicationUpdate },
    user: { update: mocks.userUpdate },
    timelineEvent: { create: mocks.timelineCreate },
  };
  return { default: { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } };
});
vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
  AuditAction: { DCR_ACCESS_GRANT: "DCR_ACCESS_GRANT" },
  AuditTargetType: { CASE: "CASE", APPLICATION: "APPLICATION" },
}));
vi.mock("@/lib/notification", () => ({ createNotification: mocks.createNotification }));
vi.mock("@/lib/mail", () => ({ sendUserMail: mocks.sendUserMail, sendAdminActionMail: vi.fn() }));
vi.mock("@/lib/utils", () => ({ generateAnonymousId: () => "anonymous" }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { PATCH } from "../[id]/route";

function request(requestStatus: "APPROVED" | "REJECTED") {
  return new NextRequest("http://localhost/api/cases/case-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ _action: "review", requestStatus }),
  });
}

const context = { params: { id: "case-1" } };

describe("委托审核自动完成 DCR 准入", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin", role: "ADMIN" } } as never);
    mocks.caseFindUnique.mockResolvedValue({
      id: "case-1",
      submitterId: "user-1",
      requestStatus: "PENDING",
      accessApplication: {
        id: "application-1",
        applicantId: "user-1",
        type: "DCR",
        status: "PENDING",
      },
    });
    mocks.caseUpdate.mockResolvedValue({ id: "case-1", requestStatus: "APPROVED" });
    mocks.applicationUpdate.mockResolvedValue({});
    mocks.userUpdate.mockResolvedValue({});
    mocks.timelineCreate.mockResolvedValue({});
    mocks.logAudit.mockResolvedValue({});
    mocks.createNotification.mockResolvedValue({});
    mocks.sendUserMail.mockResolvedValue({ success: true });
  });

  it("审核委托通过时自动批准关联申请并授予 DCR 权限", async () => {
    const response = await PATCH(request("APPROVED"), context as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.admissionAutoApproved).toBe(true);
    expect(mocks.applicationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "application-1" },
      data: expect.objectContaining({ status: "APPROVED" }),
    }));
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { dcrAccess: true, dcrPledgeSigned: true },
    });
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "user-1",
      "SYSTEM",
      "委托表审核已通过",
      expect.stringContaining("准入申请已自动通过"),
      "/dcr/tickets/case-1",
    );
  });

  it("委托未通过时不会授予准入权限", async () => {
    mocks.caseUpdate.mockResolvedValue({ id: "case-1", requestStatus: "REJECTED" });

    const response = await PATCH(request("REJECTED"), context as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.admissionAutoApproved).toBe(false);
    expect(mocks.applicationUpdate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
