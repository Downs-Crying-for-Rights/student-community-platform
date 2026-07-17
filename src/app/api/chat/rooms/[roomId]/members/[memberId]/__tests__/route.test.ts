import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockMemberFindUnique = vi.fn();
const mockMemberDeleteMany = vi.fn();
const mockBanUpsert = vi.fn();
const mockRequestUpdateMany = vi.fn();
const mockLogAudit = vi.fn();
const transactionClient = {
  chatRoomBan: { upsert: (...args: unknown[]) => mockBanUpsert(...args) },
  chatRoomMember: { deleteMany: (...args: unknown[]) => mockMemberDeleteMany(...args) },
  chatRoomJoinRequest: { updateMany: (...args: unknown[]) => mockRequestUpdateMany(...args) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    chatRoomMember: {
      findUnique: (...args: unknown[]) => mockMemberFindUnique(...args),
    },
    $transaction: (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient),
  },
}));
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, logAudit: (...args: unknown[]) => mockLogAudit(...args) };
});
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { DELETE } from "../route";

function request(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/chat/rooms/room1/members/member1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function session(id: string, role = "USER") {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

describe("DELETE /api/chat/rooms/[roomId]/members/[memberId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("默认 KICK：群主移除普通成员并施加 24 小时限制、拒绝待审批申请", async () => {
    session("owner");
    mockMemberFindUnique
      .mockResolvedValueOnce({ role: "OWNER" })
      .mockResolvedValueOnce({ userId: "member1", role: "MEMBER" });
    mockBanUpsert.mockResolvedValue({});
    mockMemberDeleteMany.mockResolvedValue({ count: 1 });
    mockRequestUpdateMany.mockResolvedValue({ count: 1 });

    const before = Date.now();
    const res = await DELETE(request(), { params: { roomId: "room1", memberId: "member1" } });

    expect(res.status).toBe(200);
    expect(mockBanUpsert).toHaveBeenCalledOnce();
    const data = mockBanUpsert.mock.calls[0][0].create;
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(mockMemberDeleteMany).toHaveBeenCalledWith({ where: { roomId: "room1", userId: "member1" } });
    expect(mockRequestUpdateMany).toHaveBeenCalledWith({
      where: { roomId: "room1", userId: "member1", status: "PENDING" },
      data: { status: "REJECTED", reviewedBy: "owner" },
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      "owner",
      "CHAT_MEMBER_KICK",
      "CHAT_ROOM",
      "room1",
      expect.objectContaining({ userId: "member1" }),
    );
  });

  it("action=BAN 创建永久封禁", async () => {
    session("owner");
    mockMemberFindUnique
      .mockResolvedValueOnce({ role: "OWNER" })
      .mockResolvedValueOnce({ userId: "member1", role: "MEMBER" });

    const res = await DELETE(request({ action: "BAN", reason: "重复骚扰" }), {
      params: { roomId: "room1", memberId: "member1" },
    });

    expect(res.status).toBe(200);
    expect(mockBanUpsert.mock.calls[0][0].create).toEqual(expect.objectContaining({
      expiresAt: null,
      reason: "重复骚扰",
    }));
    expect(mockLogAudit).toHaveBeenCalledWith(
      "owner",
      "CHAT_MEMBER_BAN",
      "CHAT_ROOM",
      "room1",
      expect.anything(),
    );
  });

  it("普通成员不能移除他人", async () => {
    session("member2");
    mockMemberFindUnique
      .mockResolvedValueOnce({ role: "MEMBER" })
      .mockResolvedValueOnce({ userId: "member1", role: "MEMBER" });

    const res = await DELETE(request(), { params: { roomId: "room1", memberId: "member1" } });

    expect(res.status).toBe(403);
    expect(mockBanUpsert).not.toHaveBeenCalled();
  });

  it("管理员可移除普通成员但不可处理其他管理员", async () => {
    session("admin");
    mockMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ userId: "admin2", role: "ADMIN" });

    const res = await DELETE(request(), { params: { roomId: "room1", memberId: "admin2" } });

    expect(res.status).toBe(403);
    expect(mockBanUpsert).not.toHaveBeenCalled();
  });

  it("不能通过成员治理接口处理群主", async () => {
    session("admin");
    mockMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ userId: "owner", role: "OWNER" });

    const res = await DELETE(request({ action: "BAN" }), { params: { roomId: "room1", memberId: "owner" } });

    expect(res.status).toBe(400);
    expect(mockBanUpsert).not.toHaveBeenCalled();
  });
});
