import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockAccessApplicationFindUnique = vi.fn();
const mockAccessApplicationUpdate = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    accessApplication: {
      findUnique: (...args: unknown[]) => mockAccessApplicationFindUnique(...args),
      update: (...args: unknown[]) => mockAccessApplicationUpdate(...args),
    },
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: { PSYCH_ACCESS_GRANT: "PSYCH_ACCESS_GRANT" },
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
  return new NextRequest("http://localhost:3000/api/psych/apply/app1", {
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
  type: "PSYCHOLOGY",
  status: "PENDING",
  applicantId: "user1",
  createdAt: new Date(),
};

// ==================== PATCH /api/psych/apply/[id] Tests ====================

describe("PATCH /api/psych/apply/[id]", () => {
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

  it("应返回 403 当非 Moderator 操作", async () => {
    setSession("user1", "USER");
    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "app1" } },
    );
    expect(res.status).toBe(403);
  });

  it("应返回 400 当 status 无效", async () => {
    setSession("mod1", "MODERATOR");
    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "INVALID" }),
      { params: { id: "app1" } },
    );
    expect(res.status).toBe(400);
  });

  it("应返回 404 当申请不存在", async () => {
    setSession("mod1", "MODERATOR");
    mockAccessApplicationFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../apply/[id]/route");
    const res = await PATCH(
      makeRequest({ status: "APPROVED" }),
      { params: { id: "nonexistent" } },
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("申请不存在");
  });

  it("应返回 409 当申请已被审核", async () => {
    setSession("mod1", "MODERATOR");
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

  it("应成功批准申请并设置 psychAccess", async () => {
    setSession("mod1", "MODERATOR");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
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

    // Verify psychAccess was set
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { psychAccess: true },
    });
  });

  it("应成功拒绝申请", async () => {
    setSession("mod1", "MODERATOR");
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

    // Should NOT set psychAccess for rejection
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("应为申请人创建通知（批准）", async () => {
    setSession("mod1", "MODERATOR");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
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
      "SYSTEM",
      "心理区准入申请已通过",
      expect.stringContaining("已通过审核"),
      "/apply",
    );
  });

  it("应为申请人创建通知（拒绝）", async () => {
    setSession("mod1", "MODERATOR");
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
      "SYSTEM",
      "心理区准入申请未通过",
      expect.stringContaining("不符合条件"),
      undefined,
    );
  });

  it("应记录审计日志", async () => {
    setSession("mod1", "MODERATOR");
    mockAccessApplicationFindUnique.mockResolvedValue(pendingApplication);
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
      "mod1",
      "PSYCH_ACCESS_GRANT",
      "APPLICATION",
      "app1",
      expect.objectContaining({
        applicantId: "user1",
        decision: "APPROVED",
      }),
    );
  });
});
