import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockReportFindUnique = vi.fn();
const mockReportUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    report: {
      findUnique: (...args: unknown[]) => mockReportFindUnique(...args),
      update: (...args: unknown[]) => mockReportUpdate(...args),
    },
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: { REPORT_RESOLVE: "REPORT_RESOLVE", REPORT_DISMISS: "REPORT_DISMISS" },
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
  return new NextRequest(fullUrl, init);
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
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "PENDING" });
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
      "REPORT_RESOLVE",
      "REPORT",
      "r1",
      expect.objectContaining({
        previousStatus: "PENDING",
        newStatus: "IN_PROGRESS",
      }),
    );
  });

  it("应成功将 IN_PROGRESS 转为 RESOLVED", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "IN_PROGRESS" });
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
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "IN_PROGRESS" });
    mockReportUpdate.mockResolvedValue({ id: "r1", status: "DISMISSED" });
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "DISMISSED" }),
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
    );
  });

  it("应拒绝无效的状态流转 PENDING → RESOLVED", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "PENDING" });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      makeRequest("PATCH", undefined, { status: "RESOLVED" }),
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
});
