import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  roomFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    chatRoom: { findUnique: mocks.roomFindUnique },
  },
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET } from "../route";

describe("GET /api/chat/rooms/[roomId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);
  });

  it("restores the current user's pending join request after a refresh", async () => {
    mocks.roomFindUnique.mockResolvedValue({
      id: "room-1",
      name: "Review room",
      description: null,
      type: "PUBLIC",
      status: "APPROVED",
      joinMode: "APPROVAL",
      createdBy: { id: "owner-1", nickname: "Owner", avatar: null },
      members: [],
      joinRequests: [{ id: "request-1", status: "PENDING" }],
      _count: { members: 0 },
      updatedAt: new Date(),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/chat/rooms/room-1"),
      { params: { roomId: "room-1" } },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.room.joinRequest).toEqual({ id: "request-1", status: "PENDING" });
    expect(mocks.roomFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "room-1" },
      include: expect.objectContaining({
        joinRequests: {
          where: { userId: "user-1" },
          select: { id: true, status: true },
        },
      }),
    }));
  });
});
