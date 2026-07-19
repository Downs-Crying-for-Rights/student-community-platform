import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdateMany: vi.fn(),
  applicationUpdateMany: vi.fn(),
  timelineCreate: vi.fn(),
  logAudit: vi.fn(),
  scanContent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    case: { findUnique: mocks.caseFindUnique, updateMany: mocks.caseUpdateMany },
    accessApplication: { updateMany: mocks.applicationUpdateMany },
    timelineEvent: { create: mocks.timelineCreate },
  };
  return {
    default: {
      case: { findUnique: mocks.caseFindUnique },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
  };
});
vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
  AuditAction: {},
  AuditTargetType: { CASE: "CASE" },
}));
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scanContent }));
vi.mock("@/lib/dcr-field-extractor", () => ({
  extractFields: () => ({ extractedFields: { schoolName: "更新后学校" }, missingFields: [] }),
}));
vi.mock("@/lib/dcr-review-rules", () => ({
  reviewDelegation: () => ({ decision: "APPROVED", reason: "完整", missingFields: [] }),
}));
vi.mock("@/lib/notification", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendUserMail: vi.fn(), sendAdminActionMail: vi.fn() }));
vi.mock("@/lib/utils", () => ({ generateAnonymousId: () => "anonymous" }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { PATCH } from "../[id]/route";

const body = {
  _action: "supplement",
  category: "TUTORING",
  formData: {
    contentType: "学校补课类",
    schoolName: "更新后学校",
    schoolCategory: "公立学历制学校",
    schoolType: "高级中学",
    schoolAddress: "测试地址",
    description: "这是更新后的详细情况描述，包含足够的信息用于管理员重新审核。",
    feeStatus: "none",
    demands: ["停止补课"],
    confirmations: [true, true, true],
    grade: "高二",
  },
};

function request() {
  return new NextRequest("http://localhost/api/cases/case-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/cases/[id] supplement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1", role: "USER" } } as never);
    mocks.caseFindUnique.mockReset();
    mocks.caseFindUnique
      .mockResolvedValueOnce({ id: "case-1", submitterId: "user-1", requestStatus: "NEED_MORE_INFO" })
      .mockResolvedValueOnce({ id: "case-1", submitterId: "user-1", requestStatus: "PENDING" });
    mocks.caseUpdateMany.mockResolvedValue({ count: 1 });
    mocks.applicationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.timelineCreate.mockResolvedValue({});
    mocks.scanContent.mockResolvedValue([]);
  });

  it("updates the same case and returns it to pending review", async () => {
    const response = await PATCH(request(), { params: { id: "case-1" } } as never);

    expect(response.status).toBe(200);
    expect(mocks.caseUpdateMany).toHaveBeenCalledWith({
      where: { id: "case-1", submitterId: "user-1", requestStatus: "NEED_MORE_INFO" },
      data: expect.objectContaining({
        formData: expect.objectContaining({
          contentType: "学校补课类",
          schoolName: "更新后学校",
        }),
        pledgeText: expect.stringContaining("【生成时间】"),
        grade: "高二",
        requestStatus: "PENDING",
      }),
    });
    expect(mocks.caseUpdateMany.mock.calls[0][0].data.formData).not.toHaveProperty("confirmations");
    expect(mocks.caseUpdateMany.mock.calls[0][0].data.formData).not.toHaveProperty("grade");
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith({
      where: { caseId: "case-1", applicantId: "user-1", type: "DCR", status: "PENDING" },
      data: { pledgeText: expect.stringContaining("【生成时间】") },
    });
    expect(mocks.timelineCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "提交补充材料", oldStatus: "NEED_MORE_INFO", newStatus: "PENDING" }),
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "user-1",
      "SUPPLEMENT_CASE",
      "CASE",
      "case-1",
      expect.objectContaining({ newRequestStatus: "PENDING" }),
      undefined,
      expect.anything(),
    );
  });

  it("rejects a supplement from anyone except the submitter", async () => {
    mocks.caseFindUnique.mockReset().mockResolvedValue({
      id: "case-1", submitterId: "other-user", requestStatus: "NEED_MORE_INFO",
    });

    const response = await PATCH(request(), { params: { id: "case-1" } } as never);

    expect(response.status).toBe(403);
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects cases that are no longer awaiting a supplement", async () => {
    mocks.caseFindUnique.mockReset().mockResolvedValue({
      id: "case-1", submitterId: "user-1", requestStatus: "APPROVED",
    });

    const response = await PATCH(request(), { params: { id: "case-1" } } as never);

    expect(response.status).toBe(409);
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("validates the full delegation shape and category consistency", async () => {
    const invalid = new NextRequest("http://localhost/api/cases/case-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, category: "OTHER" }),
    });

    const response = await PATCH(invalid, { params: { id: "case-1" } } as never);

    expect(response.status).toBe(400);
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("requires all canonical fields and confirmations", async () => {
    const invalid = new NextRequest("http://localhost/api/cases/case-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        formData: { ...body.formData, confirmations: [true, false, true] },
      }),
    });

    const response = await PATCH(invalid, { params: { id: "case-1" } } as never);

    expect(response.status).toBe(400);
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("blocks sensitive content without updating the case", async () => {
    mocks.scanContent.mockResolvedValueOnce([{ word: "测试" }]);

    const response = await PATCH(request(), { params: { id: "case-1" } } as never);

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("SENSITIVE_CONTENT");
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("fails closed when sensitive scanning fails", async () => {
    mocks.scanContent.mockRejectedValueOnce(new Error("scanner unavailable"));

    const response = await PATCH(request(), { params: { id: "case-1" } } as never);

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("SENSITIVE_SCAN_FAILED");
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("detects a concurrent review state change", async () => {
    mocks.caseUpdateMany.mockResolvedValue({ count: 0 });

    const response = await PATCH(request(), { params: { id: "case-1" } } as never);

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("CASE_NOT_AWAITING_SUPPLEMENT");
  });
});
