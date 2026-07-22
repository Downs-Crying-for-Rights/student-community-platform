import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  taskFindUnique: vi.fn(),
  taskFindFirst: vi.fn(),
  claimFindUnique: vi.fn(),
  claimUpdateMany: vi.fn(),
  claimCreate: vi.fn(),
  sessionFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  timelineCreate: vi.fn(),
  logAudit: vi.fn(),
  notifyUsers: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  user: { findUnique: mocks.userFindUnique },
  mutualAidTask: { findUnique: mocks.taskFindUnique, findFirst: mocks.taskFindFirst },
  helpClaim: { findUnique: mocks.claimFindUnique },
  helpSession: { findFirst: mocks.sessionFindFirst },
  $transaction: (callback: (client: unknown) => unknown) => callback({
    $queryRaw: mocks.queryRaw,
    mutualAidTask: { findUnique: mocks.taskFindUnique },
    helpClaim: {
      findUnique: mocks.claimFindUnique,
      updateMany: mocks.claimUpdateMany,
      create: mocks.claimCreate,
    },
    taskTimelineEvent: { create: mocks.timelineCreate },
  }),
} }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/mutual-aid-notifications", () => ({
  notifyMutualAidUsersBestEffort: mocks.notifyUsers,
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";

function request(offeredTaskId: string | null = "cm0000000000000000000002") {
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
    mocks.userFindUnique.mockResolvedValue({ dcrAccess: true, dcrPledgeSigned: true });
    mocks.taskFindUnique.mockResolvedValue({ id: context.params.id, title: "需要帮助", requesterId: "requester", status: "CLAIMED" });
    mocks.taskFindFirst.mockResolvedValue({ id: "cm0000000000000000000002", title: "我的委托", status: "OPEN" });
    mocks.claimFindUnique.mockResolvedValue(null);
    mocks.sessionFindFirst.mockResolvedValue(null);
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
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["requester"], expect.objectContaining({
      title: "收到新的互助申请",
      link: `/dcr/tasks/${context.params.id}`,
    }));
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "helper",
      "TASK_CLAIM_REQUEST",
      "TASK",
      context.params.id,
      expect.objectContaining({ claimId: "claim-1" }),
      undefined,
      expect.anything(),
    );
  });

  it("requires the explicitly offered task to be active and owned by the applicant", async () => {
    mocks.taskFindFirst.mockResolvedValue(null);

    const response = await POST(request(), context as never);

    expect(response.status).toBe(400);
    expect(mocks.taskFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ requesterId: "helper", status: { in: ["OPEN", "CLAIMED", "IN_PROGRESS"] } }),
    }));
    expect(mocks.claimCreate).not.toHaveBeenCalled();
  });

  it("allows a good Samaritan to help without offering a task", async () => {
    mocks.claimCreate.mockResolvedValue({ id: "claim-1", status: "PENDING", offeredTaskId: null });

    const response = await POST(request(null), context as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.message).toContain("无偿帮助");
    expect(mocks.claimCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ offeredTaskId: null }),
    }));
  });

  it("does not reset an accepted relationship back to pending", async () => {
    mocks.claimFindUnique.mockResolvedValue({ id: "claim-1", status: "ACCEPTED", sessionId: "session-1" });

    const response = await POST(request(), context as never);

    expect(response.status).toBe(409);
    expect(mocks.claimUpdateMany).not.toHaveBeenCalled();
    expect(mocks.claimCreate).not.toHaveBeenCalled();
  });

  it("does not allow a replaced helper to recreate the closed relationship", async () => {
    mocks.sessionFindFirst.mockResolvedValue({ id: "closed-session" });
    const response = await POST(request(), context as never);
    expect(response.status).toBe(409);
    expect(mocks.claimCreate).not.toHaveBeenCalled();
  });
});
