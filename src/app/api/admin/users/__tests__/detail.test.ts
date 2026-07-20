import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  commentFindMany: vi.fn(),
  commentCount: vi.fn(),
  dmFindMany: vi.fn(),
  dmCount: vi.fn(),
  auditCreate: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    comment: { findMany: mocks.commentFindMany, count: mocks.commentCount },
    dMMessage: { findMany: mocks.dmFindMany, count: mocks.dmCount },
    auditLog: { create: mocks.auditCreate },
    chatMessage: { count: mocks.count }, helpSession: { count: mocks.count }, helpClaim: { count: mocks.count },
    helpChatMessage: { count: mocks.count }, evidenceItem: { count: mocks.count }, taskTimelineEvent: { count: mocks.count },
    moderationAction: { count: mocks.count }, announcement: { count: mocks.count }, systemLog: { count: mocks.count },
    telemetryEvent: { count: mocks.count }, systemConfig: { count: mocks.count }, aiRuntimeConfig: { count: mocks.count },
  },
}));

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/telemetry", () => ({
  normalizeTelemetryRoute: (path: string) => path,
  recordCompletedRequest: vi.fn(),
}));

import { getServerSession } from "next-auth/next";

function setRole(role: string) {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "operator", role }, expires: "2099-01-01" } as never);
}

function request(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("admin user detail APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: "bare-user", _count: {}, accounts: [], sessions: [], identityVerificationApplications: [] });
    mocks.count.mockResolvedValue(0);
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("returns a safe summary for a bare user ID without selecting secrets", async () => {
    setRole("SUPER_ADMIN");
    const { GET } = await import("../[id]/route");
    const response = await GET(request("/api/admin/users/bare-user"), { params: { id: "bare-user" } });
    expect(response.status).toBe(200);
    const select = mocks.userFindUnique.mock.calls[0][0].select;
    expect(select.passwordHash).toBeUndefined();
    expect(select.verifiedIdentityHash).toBeUndefined();
    expect(select.accounts.select.access_token).toBeUndefined();
    expect(select.sessions.select.sessionToken).toBeUndefined();
    expect(select.identityVerificationApplications.select.evidenceKey).toBeUndefined();
    expect(select.identityVerificationApplications.select.identityCiphertext).toBeUndefined();
  });

  it("paginates ordinary content for ADMIN", async () => {
    setRole("SUPER_ADMIN");
    mocks.userFindUnique.mockResolvedValue({ id: "bare-user" });
    mocks.commentFindMany.mockResolvedValue([{ id: "comment-1", content: "safe" }]);
    mocks.commentCount.mockResolvedValue(31);
    const { GET } = await import("../[id]/activity/route");
    const response = await GET(request("/api/admin/users/bare-user/activity?domain=comments&page=2&pageSize=10"), { params: { id: "bare-user" } });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ page: 2, pageSize: 10, total: 31, totalPages: 4 });
    expect(mocks.commentFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ADMIN_USER_DETAIL_VIEW", targetId: "bare-user" }) });
  });

  it("blocks the full activity explorer for ADMIN", async () => {
    setRole("ADMIN");
    const { GET } = await import("../[id]/activity/route");
    const response = await GET(request("/api/admin/users/bare-user/activity?domain=dm-messages"), { params: { id: "bare-user" } });
    expect(response.status).toBe(403);
    expect(mocks.dmFindMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("audits every SUPER_ADMIN private-content read", async () => {
    setRole("SUPER_ADMIN");
    mocks.userFindUnique.mockResolvedValue({ id: "bare-user" });
    mocks.dmFindMany.mockResolvedValue([{ id: "dm-1", content: "private" }]);
    mocks.dmCount.mockResolvedValue(1);
    const { GET } = await import("../[id]/activity/route");
    const response = await GET(request("/api/admin/users/bare-user/activity?domain=dm-messages&pageSize=5"), { params: { id: "bare-user" } });
    expect(response.status).toBe(200);
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ operatorId: "operator", action: "ADMIN_PRIVATE_USER_CONTENT_VIEW", targetType: "USER", targetId: "bare-user", details: { domain: "dm-messages", page: 1, pageSize: 5 } }) });
  });

  it("rejects unbounded page sizes", async () => {
    setRole("SUPER_ADMIN");
    const { GET } = await import("../[id]/activity/route");
    const response = await GET(request("/api/admin/users/bare-user/activity?domain=posts&pageSize=500"), { params: { id: "bare-user" } });
    expect(response.status).toBe(400);
  });
});
