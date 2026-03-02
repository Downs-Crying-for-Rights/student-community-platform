import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockAccessApplicationFindUnique = vi.fn();
const mockAccessApplicationUpdate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    accessApplication: {
      findUnique: (...args: unknown[]) => mockAccessApplicationFindUnique(...args),
      update: (...args: unknown[]) => mockAccessApplicationUpdate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      count: (...args: unknown[]) => mockUserCount(...args),
    },
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: { DCR_ACCESS_GRANT: "DCR_ACCESS_GRANT" },
  AuditTargetType: { APPLICATION: "APPLICATION" },
}));

const mockCreateNotification = vi.fn();
vi.mock("@/lib/notification", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/dcr/apply/app1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const pendingApplication = {
  id: "app1",
  type: "DCR",
  status: "PENDING",
  applicantId: "user1",
  pledgeText: "已移除可识别信息，了解平台不组织不指挥不实施",
  createdAt: new Date(),
};

const eligibleApplicant = {
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
  violationCount: 0,
  reputationScore: 100,
};

// ==================== PATCH /api/dcr/apply/[id] Tests ====================

describe("PATCH /api/dcr/apply/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 操作", async () => {
    setSession("user1", "USER");
    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    expect(res.status).toBe(403);
  });

  it("应返回 403 当 Moderator 操作（需要 Admin）", async () => {
    setSession("mod1", "MODERATOR");
    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    expect(res.status).toBe(403);
  });

  it("应返回 400 当 status 无效", async () => {
    setSession("admin1", "ADMIN");
    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "INVALID" }),
      { params: { id: "app1" } },
    );
    expect(res.status).toBe(400);
  });

  it("应返回 404 当申请不存在", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "nonexistent" } },
    );
    expect(res.status).toBe(404);
  });

  it("应返回 409 当申请已被审核", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue({
      ...pendingApplication,
      status: "APPROVED",
    });

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toBe("该申请已被审核");
  });

  it("应成功批准申请并设置 dcrAccess、dcrPledgeSigned 和 DCR_HELPER 角色", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockUserCount.mockResolvedValue(10); // under limit
    mockUserFindUnique
      .mockResolvedValueOnce(eligibleApplicant) // eligibility check
      .mockResolvedValueOnce({ role: "USER" }); // role check for promotion
    mockAccessApplicationUpdate.mockResolvedValue({
      ...pendingApplication,
      status: "APPROVED",
      reviewedAt: new Date(),
    });
    mockUserUpdate.mockResolvedValue({});
    mockCreateNotification.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.application.status).toBe("APPROVED");

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { dcrAccess: true, dcrPledgeSigned: true, role: "DCR_HELPER" },
    });
  });

  it("应批准 MODERATOR 申请但不降级角色", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockUserCount.mockResolvedValue(10);
    mockUserFindUnique
      .mockResolvedValueOnce(eligibleApplicant) // eligibility check
      .mockResolvedValueOnce({ role: "MODERATOR" }); // role check — should NOT promote
    mockAccessApplicationUpdate.mockResolvedValue({
      ...pendingApplication,
      status: "APPROVED",
      reviewedAt: new Date(),
    });
    mockUserUpdate.mockResolvedValue({});
    mockCreateNotification.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );

    expect(res.status).toBe(200);

    // Should NOT include role change for MODERATOR
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { dcrAccess: true, dcrPledgeSigned: true },
    });
  });

  it("应返回 403 当 DCR 区已达冷启动限额", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockUserCount.mockResolvedValue(50); // at limit

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain("冷启动限额");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("应返回 403 当申请人账号年龄不足 7 天", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockUserCount.mockResolvedValue(10);
    mockUserFindUnique.mockResolvedValueOnce({
      ...eligibleApplicant,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    });

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain("账号年龄不足");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("应返回 403 当申请人违规记录过多", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockUserCount.mockResolvedValue(10);
    mockUserFindUnique.mockResolvedValueOnce({
      ...eligibleApplicant,
      violationCount: 3,
    });

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain("违规记录过多");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("应返回 403 当申请人信誉等级不足", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockUserCount.mockResolvedValue(10);
    mockUserFindUnique.mockResolvedValueOnce({
      ...eligibleApplicant,
      reputationScore: 50,
    });

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain("信誉等级不足");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("应成功拒绝申请", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockAccessApplicationUpdate.mockResolvedValue({
      ...pendingApplication,
      status: "REJECTED",
      reviewNote: "不符合条件",
      reviewedAt: new Date(),
    });
    mockCreateNotification.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "REJECTED", reviewNote: "不符合条件" }),
      { params: { id: "app1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.application.status).toBe("REJECTED");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("应为申请人创建通知（批准）", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockUserCount.mockResolvedValue(10);
    mockUserFindUnique
      .mockResolvedValueOnce(eligibleApplicant)
      .mockResolvedValueOnce({ role: "USER" });
    mockAccessApplicationUpdate.mockResolvedValue({
      ...pendingApplication,
      status: "APPROVED",
    });
    mockUserUpdate.mockResolvedValue({});
    mockCreateNotification.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../apply/[id]/route");
    await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );

    expect(mockCreateNotification).toHaveBeenCalledWith(
      "user1",
      "DCR_ACCESS",
      "DCR 准入申请已通过",
      expect.stringContaining("已通过审核"),
      "/dcr",
    );
  });

  it("应为申请人创建通知（拒绝）", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockAccessApplicationUpdate.mockResolvedValue({
      ...pendingApplication,
      status: "REJECTED",
      reviewNote: "不符合条件",
    });
    mockCreateNotification.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../apply/[id]/route");
    await PATCH(
      makeRequest({ status: "REJECTED", reviewNote: "不符合条件" }),
      { params: { id: "app1" } },
    );

    expect(mockCreateNotification).toHaveBeenCalledWith(
      "user1",
      "DCR_ACCESS",
      "DCR 准入申请未通过",
      expect.stringContaining("不符合条件"),
    );
  });

  it("应记录审计日志（批准）", async () => {
    setSession("admin1", "ADMIN");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
    mockUserCount.mockResolvedValue(10);
    mockUserFindUnique
      .mockResolvedValueOnce(eligibleApplicant)
      .mockResolvedValueOnce({ role: "USER" });
    mockAccessApplicationUpdate.mockResolvedValue({
      ...pendingApplication,
      status: "APPROVED",
    });
    mockUserUpdate.mockResolvedValue({});
    mockCreateNotification.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../apply/[id]/route");
    await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );

    expect(mockLogAudit).toHaveBeenCalledWith(
      "admin1",
      "DCR_ACCESS_GRANT",
      "APPLICATION",
      "app1",
      expect.objectContaining({
        applicantId: "user1",
        decision: "APPROVED",
        rolePromoted: "DCR_HELPER",
      }),
    );
  });
});
