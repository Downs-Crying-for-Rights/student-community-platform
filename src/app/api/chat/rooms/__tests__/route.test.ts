import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  roomFindMany: vi.fn(),
  roomCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    chatRoom: {
      findMany: mocks.roomFindMany,
      count: mocks.roomCount,
    },
  },
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));

import { getServerSession } from "next-auth/next";
import { GET } from "../route";

describe("GET /api/chat/rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);
    mocks.roomCount.mockResolvedValue(2);
  });

  it("只为当前用户已加入的群聊返回最新消息", async () => {
    mocks.roomFindMany.mockResolvedValue([
      {
        id: "joined-room",
        name: "已加入群聊",
        description: "",
        type: "PUBLIC",
        status: "APPROVED",
        joinMode: "DIRECT",
        createdBy: { id: "owner-1", nickname: "群主", avatar: null },
        members: [{ id: "membership-1" }],
        messages: [{ id: "message-1", content: "成员可见的最新消息", createdAt: new Date() }],
        _count: { members: 2 },
        updatedAt: new Date(),
      },
      {
        id: "discoverable-room",
        name: "未加入群聊",
        description: "",
        type: "PUBLIC",
        status: "APPROVED",
        joinMode: "DIRECT",
        createdBy: { id: "owner-2", nickname: "群主", avatar: null },
        members: [],
        // 即使数据库 mock 意外带回消息，响应层也必须再次清除。
        messages: [{ id: "message-2", content: "不能泄露的最新消息", createdAt: new Date() }],
        _count: { members: 3 },
        updatedAt: new Date(),
      },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/chat/rooms"), { params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.rooms[0]).toMatchObject({ isMember: true, lastMessage: { content: "成员可见的最新消息" } });
    expect(data.rooms[1]).toMatchObject({ isMember: false, lastMessage: null });
    expect(mocks.roomFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        members: { where: { userId: "user-1" }, select: { id: true } },
        messages: expect.objectContaining({
          where: { room: { members: { some: { userId: "user-1" } } } },
        }),
      }),
    }));
  });

  it("按完整群号精确查找已审核群聊", async () => {
    mocks.roomFindMany.mockResolvedValue([]);
    mocks.roomCount.mockResolvedValue(0);
    const response = await GET(new NextRequest("http://localhost/api/chat/rooms?roomNumber=12345678"), { params: {} });
    expect(response.status).toBe(200);
    expect(mocks.roomFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ roomNumber: "12345678", OR: expect.arrayContaining([{ status: "APPROVED" }]) }),
    }));
  });
});
