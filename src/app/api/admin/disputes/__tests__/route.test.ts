import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionFindMany: vi.fn(),
  sessionCount: vi.fn(),
  linkFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  helpSession: { findMany: mocks.sessionFindMany, count: mocks.sessionCount },
  mutualAidLink: { findMany: mocks.linkFindMany },
} }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET } from "../route";

describe("GET /api/admin/disputes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin", role: "ADMIN", phone: "13800000000" } } as never);
    const task = {
      id: "task1",
      title: "多争议任务",
      requester: { id: "requester", nickname: "求助者", email: null, avatar: null },
      timeline: [
        { id: "event2", action: "dispute", newStatus: "DISPUTED", details: "[session:session2]\n第二项争议" },
        { id: "event1", action: "dispute", newStatus: "DISPUTED", details: "[session:session1]\n第一项争议" },
      ],
    };
    mocks.sessionFindMany.mockResolvedValue([
      { id: "session1", helperId: "helper1", requesterId: "requester", createdAt: new Date(), closedAt: null, task },
      { id: "session2", helperId: "helper2", requesterId: "requester", createdAt: new Date(), closedAt: null, task },
    ]);
    mocks.sessionCount.mockResolvedValue(2);
    mocks.linkFindMany.mockResolvedValue([{
      id: "link-ca",
      direction: "CA",
      status: "DISPUTED",
      breakReason: "未按约定提供帮助",
      updatedAt: new Date(),
      cycle: { id: "cycle1", mode: "THREE_PARTY", status: "BROKEN", createdAt: new Date() },
      fromUser: { id: "user-c", nickname: "参与者 C" },
      toUser: { id: "requester", nickname: "参与者 A" },
    }]);
  });

  it("returns each disputed session as an independently keyed queue item", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/disputes"), { params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.disputes.map((item: { disputeSessionId: string }) => item.disputeSessionId))
      .toEqual(["session1", "session2"]);
    expect(data.disputes.map((item: { disputeExplanation: string }) => item.disputeExplanation))
      .toEqual(["第一项争议", "第二项争议"]);
    expect(data.cycleDisputes[0]).toMatchObject({
      id: "link-ca",
      direction: "CA",
      breakReason: "未按约定提供帮助",
      cycle: { id: "cycle1", mode: "THREE_PARTY" },
    });
    expect(mocks.linkFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "DISPUTED" },
    }));
  });
});
