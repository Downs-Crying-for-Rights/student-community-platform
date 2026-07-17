import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  roomFindUnique: vi.fn(),
  memberFindUnique: vi.fn(),
  memberCreate: vi.fn(),
  memberUpsert: vi.fn(),
  memberDeleteMany: vi.fn(),
  banFindFirst: vi.fn(),
  banUpsert: vi.fn(),
  banUpdateMany: vi.fn(),
  requestFindUnique: vi.fn(),
  requestUpsert: vi.fn(),
  requestUpdateMany: vi.fn(),
  logAudit: vi.fn(),
}));

const tx = {
  chatRoomMember: {
    findUnique: (...args: unknown[]) => mocks.memberFindUnique(...args),
    create: (...args: unknown[]) => mocks.memberCreate(...args),
    upsert: (...args: unknown[]) => mocks.memberUpsert(...args),
    deleteMany: (...args: unknown[]) => mocks.memberDeleteMany(...args),
  },
  chatRoomBan: {
    findFirst: (...args: unknown[]) => mocks.banFindFirst(...args),
    upsert: (...args: unknown[]) => mocks.banUpsert(...args),
  },
  chatRoomJoinRequest: {
    findUnique: (...args: unknown[]) => mocks.requestFindUnique(...args),
    upsert: (...args: unknown[]) => mocks.requestUpsert(...args),
    updateMany: (...args: unknown[]) => mocks.requestUpdateMany(...args),
  },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    chatRoom: { findUnique: (...args: unknown[]) => mocks.roomFindUnique(...args) },
    chatRoomMember: { findUnique: (...args: unknown[]) => mocks.memberFindUnique(...args) },
    chatRoomBan: { updateMany: (...args: unknown[]) => mocks.banUpdateMany(...args) },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  },
}));
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, logAudit: (...args: unknown[]) => mocks.logAudit(...args) };
});
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST as directJoin } from "../rooms/[roomId]/route";
import { POST as requestJoin } from "../rooms/[roomId]/join-requests/route";
import { PATCH as reviewRequest } from "../rooms/[roomId]/join-requests/[reqId]/route";
import { DELETE as unban } from "../rooms/[roomId]/bans/[userId]/route";

function session(id: string, role = "USER") {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

function request(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: { roomId: "room1" } };

describe("群聊踢出/封禁治理闭环", () => {
  beforeEach(() => vi.clearAllMocks());

  it("kick 后 active ban 同时阻止 direct join 和 join request", async () => {
    session("member1");
    mocks.roomFindUnique
      .mockResolvedValueOnce({ id: "room1", type: "PUBLIC", status: "APPROVED", joinMode: "DIRECT" })
      .mockResolvedValueOnce({ id: "room1", type: "PUBLIC", status: "APPROVED", joinMode: "APPROVAL" });
    mocks.banFindFirst.mockResolvedValue({ id: "ban1", revokedAt: null, expiresAt: new Date(Date.now() + 3600000) });

    const directRes = await directJoin(request("/api/chat/rooms/room1", "POST"), params);
    const requestRes = await requestJoin(request("/api/chat/rooms/room1/join-requests", "POST"), params);

    expect(directRes.status).toBe(403);
    expect(requestRes.status).toBe(403);
    expect(mocks.memberCreate).not.toHaveBeenCalled();
    expect(mocks.requestUpsert).not.toHaveBeenCalled();
  });

  it("申请提交后被封禁，审批重新检查并拒绝申请而不加群", async () => {
    session("owner");
    mocks.memberFindUnique.mockResolvedValueOnce({ role: "OWNER" });
    mocks.requestFindUnique.mockResolvedValue({
      id: "req1",
      roomId: "room1",
      userId: "member1",
      status: "PENDING",
    });
    mocks.banFindFirst.mockResolvedValue({ id: "ban1", revokedAt: null, expiresAt: null });
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 });

    const res = await reviewRequest(
      request("/api/chat/rooms/room1/join-requests/req1", "PATCH", { action: "APPROVE" }),
      { params: { roomId: "room1", reqId: "req1" } },
    );

    expect(res.status).toBe(409);
    expect(mocks.requestUpdateMany).toHaveBeenCalledWith({
      where: { id: "req1", roomId: "room1", status: "PENDING" },
      data: { status: "REJECTED", reviewedBy: "owner" },
    });
    expect(mocks.memberUpsert).not.toHaveBeenCalled();
  });

  it("unban 不自动加群，之后用户可以重新申请", async () => {
    session("owner");
    mocks.roomFindUnique.mockResolvedValueOnce({ createdById: "owner" });
    mocks.memberFindUnique
      .mockResolvedValueOnce({ role: "OWNER" })
      .mockResolvedValueOnce(null);
    mocks.banUpdateMany.mockResolvedValue({ count: 1 });

    const unbanRes = await unban(
      request("/api/chat/rooms/room1/bans/member1", "DELETE", { reason: "申诉通过" }),
      { params: { roomId: "room1", userId: "member1" } },
    );
    expect(unbanRes.status).toBe(200);
    expect(mocks.memberCreate).not.toHaveBeenCalled();
    expect(mocks.memberUpsert).not.toHaveBeenCalled();

    session("member1");
    mocks.roomFindUnique.mockResolvedValueOnce({
      id: "room1",
      type: "PUBLIC",
      status: "APPROVED",
      joinMode: "APPROVAL",
    });
    mocks.banFindFirst.mockResolvedValueOnce(null);
    mocks.memberFindUnique.mockResolvedValueOnce(null);
    mocks.requestUpsert.mockResolvedValueOnce({ id: "req2", roomId: "room1", userId: "member1", status: "PENDING" });

    const requestRes = await requestJoin(request("/api/chat/rooms/room1/join-requests", "POST"), params);
    expect(requestRes.status).toBe(201);
    expect(mocks.requestUpsert).toHaveBeenCalled();
    expect(mocks.memberCreate).not.toHaveBeenCalled();
    expect(mocks.memberUpsert).not.toHaveBeenCalled();
  });
});
