import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  applicationFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mocks.userFindUnique(...args) },
    accessApplication: {
      findFirst: (...args: unknown[]) => mocks.applicationFindFirst(...args),
    },
  },
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";

const mockGetServerSession = vi.mocked(getServerSession);
const request = () => new NextRequest("http://localhost:3000/api/psych/progress");

describe("GET /api/psych/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "user1", role: "USER" },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);
  });

  it("保持 withAuth，未登录返回 401", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../progress/route");
    expect((await GET(request(), { params: {} })).status).toBe(401);
  });

  it("返回数据库权限与最新 PSYCHOLOGY 申请", async () => {
    const createdAt = new Date("2026-07-01T10:00:00.000Z");
    const reviewedAt = new Date("2026-07-02T10:00:00.000Z");
    mocks.userFindUnique.mockResolvedValue({ psychAccess: true });
    mocks.applicationFindFirst.mockResolvedValue({
      status: "APPROVED",
      reviewNote: "审核通过",
      reviewedAt,
      createdAt,
    });
    const { GET } = await import("../progress/route");
    const response = await GET(request(), { params: {} });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      accessGranted: true,
      application: {
        status: "APPROVED",
        reviewNote: "审核通过",
        reviewedAt: reviewedAt.toISOString(),
        createdAt: createdAt.toISOString(),
      },
    });
    expect(mocks.applicationFindFirst).toHaveBeenCalledWith({
      where: { applicantId: "user1", type: "PSYCHOLOGY" },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
      },
    });
  });

  it("无申请时返回 application=null，权限仍以数据库为准", async () => {
    mocks.userFindUnique.mockResolvedValue({ psychAccess: false });
    mocks.applicationFindFirst.mockResolvedValue(null);
    const { GET } = await import("../progress/route");
    const response = await GET(request(), { params: {} });

    expect(await response.json()).toEqual({ accessGranted: false, application: null });
  });
});
