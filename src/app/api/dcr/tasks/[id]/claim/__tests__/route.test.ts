import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  taskFindUnique: vi.fn(),
  taskFindFirst: vi.fn(),
  claimFindUnique: vi.fn(),
  claimUpdateMany: vi.fn(),
  claimCreate: vi.fn(),
  timelineCreate: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  user: { findUnique: mocks.userFindUnique },
  mutualAidTask: { findUnique: mocks.taskFindUnique, findFirst: mocks.taskFindFirst },
  helpClaim: {
    findUnique: mocks.claimFindUnique,
    updateMany: mocks.claimUpdateMany,
    create: mocks.claimCreate,
  },
  taskTimelineEvent: { create: mocks.timelineCreate },
} }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";

function request(offeredTaskId = "cm0000000000000000000002") {
  return new NextRequest("http://localhost/api/dcr/tasks/cm0000000000000000000001/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offeredTaskId }),
  });
}

const context = { params: { id: "cm0000000000000000000001" } };

describe("POST /api/dcr/tasks/[id]/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "helper", role: "USER" } } as never);
    mocks.userFindUnique.mockResolvedValue({ dcrAccess: true });
    mocks.taskFindUnique.mockResolvedValue({ id: context.params.id, requesterId: "requester", status: "CLAIMED" });
    mocks.taskFindFirst.mockResolvedValue({ id: "cm0000000000000000000002", title: "我的委托", status: "OPEN" });
    mocks.claimFindUnique.mockResolvedValue(null);
    mocks.claimCreate.mockResolvedValue({ id: "claim-1", status: "PENDING", offeredTaskId: "cm0000000000000000000002" });
    mocks.timelineCreate.mockResolvedValue({});
    mocks.logAudit.mockResolvedValue({});
  });

  it("allows another helper to apply after the task is already claimed", async () => {
    const response = await POST(request(), context as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.claim.status).toBe("PENDING");
    expect(mocks.claimCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        targetTaskId: context.params.id,
        applicantId: "helper",
        offeredTaskId: "cm0000000000000000000002",
      }),
    }));
  });

  it("requires the explicitly offered task to be active and owned by the applicant", async () => {
    mocks.taskFindFirst.mockResolvedValue(null);

    const response = await POST(request(), context as never);

    expect(response.status).toBe(409);
    expect(mocks.taskFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ requesterId: "helper", status: { in: ["OPEN", "CLAIMED", "IN_PROGRESS"] } }),
    }));
    expect(mocks.claimCreate).not.toHaveBeenCalled();
  });

  it("does not reset an accepted relationship back to pending", async () => {
    mocks.claimFindUnique.mockResolvedValue({ id: "claim-1", status: "ACCEPTED", sessionId: "session-1" });

    const response = await POST(request(), context as never);

    expect(response.status).toBe(409);
    expect(mocks.claimUpdateMany).not.toHaveBeenCalled();
    expect(mocks.claimCreate).not.toHaveBeenCalled();
  });
});
