import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findUpdated: vi.fn(),
  updateMany: vi.fn(),
  userUpdate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  createNotification: vi.fn(),
  sendUserMail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    accessApplication: {
      findUnique: vi.fn((...args: unknown[]) => {
        const query = args[0] as { where?: { id?: string } };
        return mocks.findUnique.mock.calls.length === 0
          ? mocks.findUnique(...args)
          : mocks.findUpdated(query);
      }),
      updateMany: (...args: unknown[]) => mocks.updateMany(...args),
    },
    user: { update: (...args: unknown[]) => mocks.userUpdate(...args) },
    auditLog: { create: (...args: unknown[]) => mocks.auditCreate(...args) },
  };
  return {
    default: {
      $transaction: (operation: (client: typeof tx) => unknown) =>
        mocks.transaction(operation, tx),
    },
  };
});

vi.mock("@/lib/audit", () => ({
  AuditAction: {
    PSYCH_ACCESS_GRANT: "PSYCH_ACCESS_GRANT",
    PSYCH_ACCESS_REJECT: "PSYCH_ACCESS_REJECT",
  },
  AuditTargetType: { APPLICATION: "APPLICATION" },
}));
vi.mock("@/lib/notification", () => ({
  createNotification: (...args: unknown[]) => mocks.createNotification(...args),
}));
vi.mock("@/lib/mail", () => ({
  sendUserMail: (...args: unknown[]) => mocks.sendUserMail(...args),
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";

const mockGetServerSession = vi.mocked(getServerSession);
const pendingApplication = {
  id: "app1",
  type: "PSYCHOLOGY",
  status: "PENDING",
  applicantId: "user1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/psych/apply/app1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setSession(role = "MODERATOR") {
  mockGetServerSession.mockResolvedValue({
    user: { id: "mod1", role },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as never);
}

describe("PATCH /api/psych/apply/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      (operation: (client: object) => unknown, client: object) => operation(client),
    );
    mocks.findUnique.mockResolvedValue(pendingApplication);
    mocks.findUpdated.mockResolvedValue({ ...pendingApplication, status: "APPROVED" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.userUpdate.mockResolvedValue({});
    mocks.auditCreate.mockResolvedValue({});
    mocks.createNotification.mockResolvedValue({});
    mocks.sendUserMail.mockResolvedValue({ success: true });
  });

  it("未登录返回 401，非 Moderator 返回 403", async () => {
    const { PATCH } = await import("../apply/[id]/route");
    mockGetServerSession.mockResolvedValue(null);
    expect((await PATCH(makeRequest({ status: "APPROVED" }), { params: { id: "app1" } })).status).toBe(401);

    setSession("USER");
    expect((await PATCH(makeRequest({ status: "APPROVED" }), { params: { id: "app1" } })).status).toBe(403);
  });

  it("严格拒绝非 PSYCHOLOGY 申请且不修改任何状态", async () => {
    setSession();
    mocks.findUnique.mockResolvedValue({ ...pendingApplication, type: "DCR" });
    const { PATCH } = await import("../apply/[id]/route");
    const response = await PATCH(makeRequest({ status: "APPROVED" }), { params: { id: "app1" } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("APPLICATION_TYPE_INVALID");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("在同一事务中条件批准申请、授予权限并写入准确审计详情", async () => {
    setSession();
    const { PATCH } = await import("../apply/[id]/route");
    const response = await PATCH(makeRequest({ status: "APPROVED" }), { params: { id: "app1" } });

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "app1", type: "PSYCHOLOGY", status: "PENDING" },
      data: expect.objectContaining({ status: "APPROVED" }),
    }));
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { psychAccess: true },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "mod1",
        action: "PSYCH_ACCESS_GRANT",
        details: expect.objectContaining({
          applicationType: "PSYCHOLOGY",
          decision: "APPROVED",
          psychAccessGranted: true,
        }),
      }),
    });
  });

  it("拒绝申请时不改写已有 psychAccess，并记录拒绝审计", async () => {
    setSession();
    mocks.findUpdated.mockResolvedValue({ ...pendingApplication, status: "REJECTED" });
    const { PATCH } = await import("../apply/[id]/route");
    const response = await PATCH(
      makeRequest({ status: "REJECTED", reviewNote: "不符合条件" }),
      { params: { id: "app1" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PSYCH_ACCESS_REJECT",
        details: expect.objectContaining({
          decision: "REJECTED",
          psychAccessGranted: false,
          reviewNote: "不符合条件",
        }),
      }),
    });
  });

  it("条件更新未命中时返回 409，防止重复审核继续写权限", async () => {
    setSession();
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const { PATCH } = await import("../apply/[id]/route");
    const response = await PATCH(makeRequest({ status: "APPROVED" }), { params: { id: "app1" } });

    expect(response.status).toBe(409);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("通知和邮件在事务提交后 best-effort，失败不改变核心成功响应", async () => {
    setSession();
    mocks.createNotification.mockRejectedValue(new Error("notification unavailable"));
    mocks.sendUserMail.mockRejectedValue(new Error("mail unavailable"));
    const { PATCH } = await import("../apply/[id]/route");
    const response = await PATCH(makeRequest({ status: "APPROVED" }), { params: { id: "app1" } });

    expect(response.status).toBe(200);
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "user1",
      "SYSTEM",
      "心理区准入申请已通过",
      expect.stringContaining("已通过审核"),
      "/psych",
    );
    expect(mocks.sendUserMail).toHaveBeenCalled();
  });
});
