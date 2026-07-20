import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  requestFindMany: vi.fn(),
  cycleFindMany: vi.fn(),
  linkFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  user: { findMany: mocks.userFindMany },
  mutualAidMatchRequest: { findMany: mocks.requestFindMany },
  mutualAidCycle: { findMany: mocks.cycleFindMany },
  mutualAidLink: { findMany: mocks.linkFindMany },
} }));
vi.mock("@/lib/mutual-aid-cycle", () => ({ createCycle: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET } from "../route";

describe("GET /api/admin/dcr/cycles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as never);
    mocks.userFindMany.mockResolvedValue([]);
    mocks.requestFindMany.mockResolvedValue([]);
    mocks.cycleFindMany.mockResolvedValue([]);
    mocks.linkFindMany.mockResolvedValue([{
      id: "link-ab",
      status: "DISPUTED",
      breakReason: "对方未按约定提供协助",
      cycle: { id: "cycle-1", mode: "THREE_PARTY", status: "BROKEN" },
      fromUser: { id: "user-a", nickname: "用户 A" },
      toUser: { id: "user-b", nickname: "用户 B" },
    }]);
  });

  it("returns disputed and rejected cycle links as an explicit admin queue", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/dcr/cycles"), { params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.linkFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ["DISPUTED", "REJECTED"] } },
    }));
    expect(data.disputedLinks[0]).toMatchObject({
      id: "link-ab",
      breakReason: "对方未按约定提供协助",
      cycle: { id: "cycle-1", mode: "THREE_PARTY" },
    });
  });
});
