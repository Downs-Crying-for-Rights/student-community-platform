import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockReportFindUnique = vi.fn();
const mockReportUpdate = vi.fn();
const mockPostUpdate = vi.fn();
const mockCommentUpdate = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockPunishmentCreate = vi.fn();
const mockNotificationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    report: {
      findUnique: (...args: unknown[]) => mockReportFindUnique(...args),
      update: (...args: unknown[]) => mockReportUpdate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      report: { update: (...args: unknown[]) => mockReportUpdate(...args) },
      post: { update: (...args: unknown[]) => mockPostUpdate(...args) },
      comment: { update: (...args: unknown[]) => mockCommentUpdate(...args) },
      user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
      userPunishment: { create: (...args: unknown[]) => mockPunishmentCreate(...args) },
      notification: { create: (...args: unknown[]) => mockNotificationCreate(...args) },
      auditLog: { create: vi.fn() },
    }),
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: { REPORT_CLAIM: "REPORT_CLAIM", REPORT_RESOLVE: "REPORT_RESOLVE", REPORT_DISMISS: "REPORT_DISMISS" },
  AuditTargetType: { REPORT: "REPORT" },
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

function makeRequest(method: string, url?: string, body?: unknown): NextRequest {
  const fullUrl = url ?? "http://localhost:3000/api/reports/r1";
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(fullUrl, init as any);
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== PATCH /api/reports/[id] Tests ====================

describe("PATCH /api/reports/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationCreate.mockResolvedValue({});
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "IN_PROGRESS" }),
      { params: { id: "r1" } },
    );
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Moderator 用户操作", async () => {
    setSession("user1", "USER");
    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "IN_PROGRESS" }),
      { params: { id: "r1" } },
    );
    expect(res.status).toBe(403);
  });

  it("应返回 404 当举报不存在", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "IN_PROGRESS" }),
      { params: { id: "nonexistent" } },
    );
    expect(res.status).toBe(404);
  });

  it("应成功将 PENDING 转为 IN_PROGRESS", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "PENDING", reporterId: "reporter1" });
    mockReportUpdate.mockResolvedValue({ id: "r1", status: "IN_PROGRESS" });
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "IN_PROGRESS" }),
      { params: { id: "r1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.report.status).toBe("IN_PROGRESS");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "mod1",
      "REPORT_CLAIM",
      "REPORT",
      "r1",
      expect.objectContaining({
        previousStatus: "PENDING",
        newStatus: "IN_PROGRESS",
      }),
      undefined,
      expect.anything(),
    );
  });

  it("应成功将 IN_PROGRESS 转为 RESOLVED", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "IN_PROGRESS", reporterId: "reporter1" });
    mockReportUpdate.mockResolvedValue({ id: "r1", status: "RESOLVED", resolution: "已处理" });
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "RESOLVED", resolution: "已处理" }),
      { params: { id: "r1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.report.status).toBe("RESOLVED");
  });

  it("应成功将 IN_PROGRESS 转为 DISMISSED", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "IN_PROGRESS", reporterId: "reporter1" });
    mockReportUpdate.mockResolvedValue({ id: "r1", status: "DISMISSED" });
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "DISMISSED", resolution: "未发现违规" }),
      { params: { id: "r1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.report.status).toBe("DISMISSED");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "mod1",
      "REPORT_DISMISS",
      "REPORT",
      "r1",
      expect.objectContaining({
        previousStatus: "IN_PROGRESS",
        newStatus: "DISMISSED",
      }),
      undefined,
      expect.anything(),
    );
  });

  it("应拒绝无效的状态流转 PENDING → RESOLVED", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "PENDING" });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "RESOLVED", resolution: "确认违规" }),
      { params: { id: "r1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("无效的状态流转");
  });

  it("应拒绝无效的状态流转 RESOLVED → IN_PROGRESS（不可回退）", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "RESOLVED" });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "IN_PROGRESS" }),
      { params: { id: "r1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("无效的状态流转");
  });

  it("应拒绝无效的状态流转 DISMISSED → IN_PROGRESS（不可回退）", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "DISMISSED" });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "IN_PROGRESS" }),
      { params: { id: "r1" } },
    );

    expect(res.status).toBe(400);
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("mod1", "MODERATOR");
    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "INVALID_STATUS" }),
      { params: { id: "r1" } },
    );
    expect(res.status).toBe(400);
  });

  it("接受帖子举报时删除帖子并通知举报人", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({
      id: "r1",
      status: "IN_PROGRESS",
      reporterId: "reporter1",
      targetPost: { id: "p1", authorId: "author1", status: "PUBLISHED" },
    });
    mockReportUpdate.mockResolvedValue({ id: "r1", status: "RESOLVED", resolutionAction: "DELETE_TARGET" });
    mockPostUpdate.mockResolvedValue({ id: "p1", status: "DELETED" });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "RESOLVED", resolution: "帖子违反社区规范", action: "DELETE_TARGET" }),
      { params: { id: "r1" } },
    );

    expect(res.status).toBe(200);
    expect(mockPostUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "DELETED" } });
    expect(mockNotificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "reporter1", type: "REPORT_RESULT", title: "举报已处理" }),
    }));
  });

  it("版主不能通过举报处理封禁责任用户", async () => {
    setSession("mod1", "MODERATOR");

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "RESOLVED", resolution: "确认违规", action: "BAN_RESPONSIBLE_USER" }),
      { params: { id: "r1" } },
    );

    expect(res.status).toBe(403);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
