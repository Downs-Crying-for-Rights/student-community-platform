import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockAccessApplicationFindFirst = vi.fn();
const mockAccessApplicationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    accessApplication: {
      findFirst: (...args: unknown[]) => mockAccessApplicationFindFirst(...args),
      create: (...args: unknown[]) => mockAccessApplicationCreate(...args),
    },
  },
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

const VALID_PLEDGE = "我确认已移除可识别信息，了解平台不组织不指挥不实施任何举报或对抗行动";

function makeRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/dcr/apply", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : {},
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== POST /api/dcr/apply Tests ====================

describe("POST /api/dcr/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest({ pledgeText: VALID_PLEDGE }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 400 当 pledgeText 缺失", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../apply/route");
    const res = await POST(makeRequest({}), { params: {} });
    expect(res.status).toBe(400);
  });

  it("应返回 400 当 pledgeText 不包含必要短语", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../apply/route");
    const res = await POST(
      makeRequest({ pledgeText: "我同意遵守规则" }),
      { params: {} },
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("已移除可识别信息");
  });

  it("应返回 409 当用户已拥有 DCR 访问权限", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });

    const { POST } = await import("../apply/route");
    const res = await POST(
      makeRequest({ pledgeText: VALID_PLEDGE }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("您已拥有 DCR 区访问权限");
  });

  it("应返回 409 当用户已有待审核申请", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockAccessApplicationFindFirst.mockResolvedValue({
      id: "app1",
      type: "DCR",
      status: "PENDING",
    });

    const { POST } = await import("../apply/route");
    const res = await POST(
      makeRequest({ pledgeText: VALID_PLEDGE }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("您已有待审核的 DCR 准入申请");
  });

  it("应成功创建 DCR 准入申请", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockAccessApplicationFindFirst.mockResolvedValue(null);
    mockAccessApplicationCreate.mockResolvedValue({
      id: "app1",
      type: "DCR",
      status: "PENDING",
      pledgeText: VALID_PLEDGE,
      applicantId: "user1",
      createdAt: new Date(),
    });

    const { POST } = await import("../apply/route");
    const res = await POST(
      makeRequest({ pledgeText: VALID_PLEDGE }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.application.type).toBe("DCR");
    expect(data.application.status).toBe("PENDING");
    expect(data.application.pledgeText).toBe(VALID_PLEDGE);

    expect(mockAccessApplicationCreate).toHaveBeenCalledWith({
      data: {
        type: "DCR",
        status: "PENDING",
        pledgeText: VALID_PLEDGE,
        applicantId: "user1",
      },
    });
  });
});
