import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdateMany: vi.fn(),
  applicationUpdateMany: vi.fn(),
  userUpdate: vi.fn(),
  userCount: vi.fn(),
  timelineCreate: vi.fn(),
  logAudit: vi.fn(),
  createNotification: vi.fn(),
  sendUserMail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    case: { findUnique: mocks.caseFindUnique, updateMany: mocks.caseUpdateMany },
    accessApplication: { updateMany: mocks.applicationUpdateMany },
    user: { update: mocks.userUpdate, count: mocks.userCount },
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

function request(requestStatus: "APPROVED" | "REJECTED", expectedStatus = "PENDING") {
  return new NextRequest("http://localhost/api/cases/case-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ _action: "review", expectedStatus, requestStatus }),
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
        caseId: "case-1",
        pledgeText: "我已阅读并同意守则",
        applicant: {
          id: "user-1",
          role: "USER",
          createdAt: new Date(),
          phone: "13800138000",
          quizPassed: true,
          violationCount: 0,
          dcrAccess: false,
          dcrPledgeSigned: false,
        },
      },
    });
    mocks.caseUpdateMany.mockResolvedValue({ count: 1 });
    mocks.applicationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userUpdate.mockResolvedValue({});
    mocks.userCount.mockResolvedValue(1);
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
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "application-1", status: "PENDING" },
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
    const response = await PATCH(request("REJECTED"), context as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.admissionAutoApproved).toBe(false);
    expect(data.admissionAutoRejected).toBe(true);
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "application-1", status: "PENDING" },
      data: expect.objectContaining({ status: "REJECTED" }),
    }));
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("缺少 expectedStatus 时拒绝审核请求", async () => {
    const invalid = new NextRequest("http://localhost/api/cases/case-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ _action: "review", requestStatus: "APPROVED" }),
    });

    const response = await PATCH(invalid, context as never);

    expect(response.status).toBe(400);
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("expectedStatus 过期时返回冲突且不产生写入", async () => {
    const response = await PATCH(request("APPROVED", "MANUAL_REVIEW"), context as never);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("CASE_REVIEW_STATUS_CHANGED");
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
    expect(mocks.applicationUpdateMany).not.toHaveBeenCalled();
  });
});
