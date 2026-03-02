import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockAppFindMany = vi.fn();
const mockCaseFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    accessApplication: {
      findMany: (...args: unknown[]) => mockAppFindMany(...args),
    },
    case: {
      findMany: (...args: unknown[]) => mockCaseFindMany(...args),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/admin/applications");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

function setAdminSession() {
  mockGetServerSession.mockResolvedValue({
    user: { id: "admin1", role: "ADMIN" },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("GET /api/admin/applications?type=DCR — relatedCase enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DCR 类型申请返回 relatedCase 包含 formData、pledgeText、category、status", async () => {
    setAdminSession();

    const mockFormData = {
      schoolName: "测试大学",
      schoolType: "公立",
      schoolAddress: "北京市海淀区",
      reportChannel: "教育局",
      description: "违规收费行为",
      fees: "每学期多收500元",
      demands: ["退还多收费用", "公开道歉"],
    };

    mockAppFindMany.mockResolvedValue([
      {
        id: "app-1",
        type: "DCR",
        status: "PENDING",
        applicantId: "user-1",
        pledgeText: "我承诺以上信息真实",
        reviewNote: null,
        createdAt: new Date("2024-06-01"),
        applicant: { id: "user-1", nickname: "张三" },
      },
    ]);

    mockCaseFindMany.mockResolvedValue([
      {
        submitterId: "user-1",
        formData: mockFormData,
        pledgeText: "我承诺以上信息真实",
        category: "EDUCATION",
        status: "OPENED",
        createdAt: new Date("2024-06-01"),
      },
    ]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest({ type: "DCR" }), { params: {} } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.applications).toHaveLength(1);

    const app = data.applications[0];
    expect(app.relatedCase).not.toBeNull();
    expect(app.relatedCase.formData).toEqual(mockFormData);
    expect(app.relatedCase.pledgeText).toBe("我承诺以上信息真实");
    expect(app.relatedCase.category).toBe("EDUCATION");
    expect(app.relatedCase.status).toBe("OPENED");
  });

  it("多个 DCR 申请各自关联正确的 Case", async () => {
    setAdminSession();

    mockAppFindMany.mockResolvedValue([
      {
        id: "app-1",
        type: "DCR",
        status: "PENDING",
        applicantId: "user-1",
        pledgeText: null,
        reviewNote: null,
        createdAt: new Date("2024-06-01"),
        applicant: { id: "user-1", nickname: "张三" },
      },
      {
        id: "app-2",
        type: "DCR",
        status: "APPROVED",
        applicantId: "user-2",
        pledgeText: null,
        reviewNote: null,
        createdAt: new Date("2024-05-01"),
        applicant: { id: "user-2", nickname: "李四" },
      },
    ]);

    mockCaseFindMany.mockResolvedValue([
      {
        submitterId: "user-1",
        formData: { schoolName: "大学A" },
        pledgeText: "声明A",
        category: "EDUCATION",
        status: "OPENED",
        createdAt: new Date("2024-06-01"),
      },
      {
        submitterId: "user-2",
        formData: { schoolName: "大学B" },
        pledgeText: "声明B",
        category: "LABOR",
        status: "IN_PROGRESS",
        createdAt: new Date("2024-05-01"),
      },
    ]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest({ type: "DCR" }), { params: {} } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.applications).toHaveLength(2);

    expect(data.applications[0].relatedCase.formData.schoolName).toBe("大学A");
    expect(data.applications[1].relatedCase.formData.schoolName).toBe("大学B");
  });

  it("DCR 申请无关联 Case 时 relatedCase 为 null", async () => {
    setAdminSession();

    mockAppFindMany.mockResolvedValue([
      {
        id: "app-1",
        type: "DCR",
        status: "PENDING",
        applicantId: "user-1",
        pledgeText: null,
        reviewNote: null,
        createdAt: new Date("2024-06-01"),
        applicant: { id: "user-1", nickname: "张三" },
      },
    ]);

    mockCaseFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest({ type: "DCR" }), { params: {} } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.applications[0].relatedCase).toBeNull();
  });

  it("PSYCHOLOGY 类型申请 relatedCase 为 null", async () => {
    setAdminSession();

    mockAppFindMany.mockResolvedValue([
      {
        id: "app-1",
        type: "PSYCHOLOGY",
        status: "PENDING",
        applicantId: "user-1",
        pledgeText: null,
        reviewNote: null,
        createdAt: new Date("2024-06-01"),
        applicant: { id: "user-1", nickname: "张三" },
      },
    ]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest({ type: "PSYCHOLOGY" }), { params: {} } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.applications[0].relatedCase).toBeNull();
    // case.findMany should not be called when there are no DCR apps
    expect(mockCaseFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/applications — 保持性测试：现有字段不受影响", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("返回的申请包含所有原有字段（id, type, status, applicant, pledgeText, reviewNote, createdAt, reviewedAt）", async () => {
    setAdminSession();

    const createdAt = new Date("2024-06-01");
    const reviewedAt = new Date("2024-06-02");

    mockAppFindMany.mockResolvedValue([
      {
        id: "app-preserve-1",
        type: "DCR",
        status: "APPROVED",
        applicantId: "user-p1",
        pledgeText: "保持性声明文本",
        reviewNote: "审核通过备注",
        createdAt,
        reviewedAt,
        applicant: { id: "user-p1", nickname: "保持性用户" },
      },
    ]);

    mockCaseFindMany.mockResolvedValue([
      {
        submitterId: "user-p1",
        formData: { schoolName: "保持性大学" },
        pledgeText: "Case声明",
        category: "EDUCATION",
        status: "OPENED",
        createdAt,
      },
    ]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest({ type: "DCR" }), { params: {} } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    const app = data.applications[0];

    // Verify all original fields are preserved exactly
    expect(app.id).toBe("app-preserve-1");
    expect(app.type).toBe("DCR");
    expect(app.status).toBe("APPROVED");
    expect(app.applicantId).toBe("user-p1");
    expect(app.pledgeText).toBe("保持性声明文本");
    expect(app.reviewNote).toBe("审核通过备注");
    expect(app.createdAt).toBe(createdAt.toISOString());
    expect(app.reviewedAt).toBe(reviewedAt.toISOString());
    expect(app.applicant).toEqual({ id: "user-p1", nickname: "保持性用户" });
  });

  it("PSYCHOLOGY 类型申请的原有字段同样不受影响", async () => {
    setAdminSession();

    const createdAt = new Date("2024-05-15");

    mockAppFindMany.mockResolvedValue([
      {
        id: "app-psych-1",
        type: "PSYCHOLOGY",
        status: "PENDING",
        applicantId: "user-p2",
        pledgeText: null,
        reviewNote: null,
        createdAt,
        reviewedAt: null,
        applicant: { id: "user-p2", nickname: "心理用户" },
      },
    ]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest({ type: "PSYCHOLOGY" }), { params: {} } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    const app = data.applications[0];

    expect(app.id).toBe("app-psych-1");
    expect(app.type).toBe("PSYCHOLOGY");
    expect(app.status).toBe("PENDING");
    expect(app.applicantId).toBe("user-p2");
    expect(app.pledgeText).toBeNull();
    expect(app.reviewNote).toBeNull();
    expect(app.createdAt).toBe(createdAt.toISOString());
    expect(app.reviewedAt).toBeNull();
    expect(app.applicant).toEqual({ id: "user-p2", nickname: "心理用户" });
  });

  it("混合类型申请列表中每条记录的原有字段均完整保留", async () => {
    setAdminSession();

    mockAppFindMany.mockResolvedValue([
      {
        id: "app-mix-1",
        type: "DCR",
        status: "PENDING",
        applicantId: "user-m1",
        pledgeText: "DCR声明",
        reviewNote: null,
        createdAt: new Date("2024-06-01"),
        reviewedAt: null,
        applicant: { id: "user-m1", nickname: "用户A" },
      },
      {
        id: "app-mix-2",
        type: "PSYCHOLOGY",
        status: "REJECTED",
        applicantId: "user-m2",
        pledgeText: null,
        reviewNote: "不符合条件",
        createdAt: new Date("2024-05-20"),
        reviewedAt: new Date("2024-05-21"),
        applicant: { id: "user-m2", nickname: "用户B" },
      },
    ]);

    mockCaseFindMany.mockResolvedValue([
      {
        submitterId: "user-m1",
        formData: { schoolName: "混合大学" },
        pledgeText: "Case声明",
        category: "EDUCATION",
        status: "OPENED",
        createdAt: new Date("2024-06-01"),
      },
    ]);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(), { params: {} } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.applications).toHaveLength(2);

    // DCR application preserves all original fields
    const dcrApp = data.applications[0];
    expect(dcrApp.id).toBe("app-mix-1");
    expect(dcrApp.type).toBe("DCR");
    expect(dcrApp.status).toBe("PENDING");
    expect(dcrApp.pledgeText).toBe("DCR声明");
    expect(dcrApp.reviewNote).toBeNull();
    expect(dcrApp.applicant).toEqual({ id: "user-m1", nickname: "用户A" });

    // PSYCHOLOGY application preserves all original fields
    const psychApp = data.applications[1];
    expect(psychApp.id).toBe("app-mix-2");
    expect(psychApp.type).toBe("PSYCHOLOGY");
    expect(psychApp.status).toBe("REJECTED");
    expect(psychApp.reviewNote).toBe("不符合条件");
    expect(psychApp.applicant).toEqual({ id: "user-m2", nickname: "用户B" });
  });
});
