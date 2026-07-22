import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findPunishments: vi.fn(),
  apply: vi.fn(),
  revoke: vi.fn(),
  recalculate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  user: { findUnique: mocks.findUser },
  userPunishment: { findMany: mocks.findPunishments },
} }));
vi.mock("@/lib/punishment-service", () => ({
  applyPunishment: mocks.apply,
  revokePunishment: mocks.revoke,
  recalculatePunishmentProjection: mocks.recalculate,
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../[id]/ban/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/users/u1/ban", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("legacy admin ban endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin", role: "ADMIN", phone: "13800138000" }, expires: "2099-01-01" } as never);
    mocks.findUser.mockResolvedValueOnce({ id: "u1", role: "USER" }).mockResolvedValueOnce({ id: "u1", isBanned: true, isShadowBanned: false });
    mocks.findPunishments.mockResolvedValue([]);
  });

  it("delegates old ban requests to the shared service", async () => {
    const response = await POST(request({ action: "ban", shadowBan: false, reason: "严重违规" }), { params: { id: "u1" } });
    expect(response.status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith({ userId: "u1", operatorId: "admin", type: "ACCOUNT_BAN", reason: "严重违规" });
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("revokes structured and legacy bans through the shared service", async () => {
    mocks.findPunishments.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    const response = await POST(request({ action: "unban", shadowBan: false, reason: "复核解除" }), { params: { id: "u1" } });
    expect(response.status).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledTimes(2);
    expect(mocks.revoke).toHaveBeenCalledWith({ punishmentId: "p1", operatorId: "admin", reason: "复核解除" });
    expect(mocks.findPunishments).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: { in: ["ACCOUNT_BAN", "TEMPORARY_BAN", "PERMANENT_BAN", "POST_SHADOW_HIDE"] },
      }),
    }));
  });

  it("拒绝封禁最后一个可用的超级管理员", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin", role: "SUPER_ADMIN", phone: "13800138000" }, expires: "2099-01-01" } as never);
    mocks.findUser.mockReset().mockResolvedValueOnce({ id: "u1", role: "SUPER_ADMIN" });
    mocks.apply.mockRejectedValue(new Error("LAST_ACTIVE_SUPER_ADMIN"));

    const response = await POST(request({ action: "ban", shadowBan: false, reason: "违规" }), { params: { id: "u1" } });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("最后一个");
  });

  it("rejects self punishment and invalid input", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1", role: "ADMIN", phone: "13800138000" }, expires: "2099-01-01" } as never);
    expect((await POST(request({ action: "ban", reason: "原因" }), { params: { id: "u1" } })).status).toBe(400);
    expect((await POST(request({ action: "invalid", reason: "原因" }), { params: { id: "u2" } })).status).toBe(400);
  });
});
