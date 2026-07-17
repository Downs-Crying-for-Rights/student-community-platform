import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockUserFindUnique = vi.fn();
const mockCaseFindUnique = vi.fn();
const mockApplicationFindUnique = vi.fn();
const mockApplicationFindFirst = vi.fn();
const mockApplicationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    case: { findUnique: (...args: unknown[]) => mockCaseFindUnique(...args) },
    accessApplication: {
      findUnique: (...args: unknown[]) => mockApplicationFindUnique(...args),
      findFirst: (...args: unknown[]) => mockApplicationFindFirst(...args),
      create: (...args: unknown[]) => mockApplicationCreate(...args),
    },
  },
}));

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

const VALID_PLEDGE = "我确认已移除可识别信息，了解平台不组织不指挥不实施任何举报或对抗行动";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/dcr/apply", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setSession() {
  mockGetServerSession.mockResolvedValue({
    user: { id: "user1", role: "USER" },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as never);
}

describe("POST /api/dcr/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession();
    mockUserFindUnique.mockResolvedValue({
      id: "user1",
      dcrAccess: false,
      phone: "13800138000",
      quizPassed: true,
    });
    mockCaseFindUnique.mockResolvedValue({
      id: "case1",
      submitterId: "user1",
      requestStatus: "APPROVED",
    });
    mockApplicationFindUnique.mockResolvedValue(null);
    mockApplicationFindFirst.mockResolvedValue(null);
    mockApplicationCreate.mockResolvedValue({
      id: "app1",
      type: "DCR",
      status: "PENDING",
      applicantId: "user1",
      caseId: "case1",
      pledgeText: VALID_PLEDGE,
    });
  });

  it("未登录返回 401", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../apply/route");
    expect((await POST(makeRequest({ pledgeText: VALID_PLEDGE, caseId: "case1" }), { params: {} })).status).toBe(401);
  });

  it("旧客户端缺少 caseId 时拒绝猜测关联", async () => {
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest({ pledgeText: VALID_PLEDGE }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("委托不存在时返回明确错误", async () => {
    mockCaseFindUnique.mockResolvedValue(null);
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest({ pledgeText: VALID_PLEDGE, caseId: "missing" }), { params: {} });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("CASE_REQUIRED");
  });

  it("不能关联其他用户的委托", async () => {
    mockCaseFindUnique.mockResolvedValue({ id: "case1", submitterId: "other", requestStatus: "APPROVED" });
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest({ pledgeText: VALID_PLEDGE, caseId: "case1" }), { params: {} });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("CASE_NOT_OWNED");
  });

  it("同一 Case 已有本人的申请时幂等返回", async () => {
    mockApplicationFindUnique.mockResolvedValue({
      id: "app-existing",
      type: "DCR",
      applicantId: "user1",
      caseId: "case1",
      status: "PENDING",
    });
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest({ pledgeText: VALID_PLEDGE, caseId: "case1" }), { params: {} });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.existing).toBe(true);
    expect(mockApplicationCreate).not.toHaveBeenCalled();
  });

  it("已有其他待审申请时拒绝创建", async () => {
    mockApplicationFindFirst.mockResolvedValue({ id: "other-app", caseId: "case0" });
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest({ pledgeText: VALID_PLEDGE, caseId: "case1" }), { params: {} });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("APPLICATION_ALREADY_PENDING");
  });

  it("成功创建与明确 Case 关联的 DCR 申请", async () => {
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest({ pledgeText: VALID_PLEDGE, caseId: "case1" }), { params: {} });
    expect(res.status).toBe(201);
    expect(mockApplicationCreate).toHaveBeenCalledWith({
      data: {
        type: "DCR",
        status: "PENDING",
        pledgeText: VALID_PLEDGE,
        applicantId: "user1",
        caseId: "case1",
      },
    });
  });
});
