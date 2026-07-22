import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), moderationCreate: vi.fn(), audit: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/mutual-aid-cycle", () => ({ resolveCycleDispute: mocks.resolve }));
vi.mock("@/lib/prisma", () => ({ default: { moderationAction: { create: mocks.moderationCreate } } }));
vi.mock("@/lib/audit", () => ({
  AuditAction: { CYCLE_DISPUTE_RESUME: "RESUME", CYCLE_DISPUTE_REINVITE: "REINVITE", CYCLE_DISPUTE_CLOSE: "CLOSE" },
  AuditTargetType: { MUTUAL_AID_CYCLE: "MUTUAL_AID_CYCLE" },
  logAudit: mocks.audit,
}));
vi.mock("@/lib/mutual-aid-notifications", () => ({ notifyMutualAidUsersBestEffort: mocks.notify }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "./route";

function request(action: string) {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin", role: "ADMIN", phone: "13800000000" } } as never);
  return new NextRequest("http://localhost/api/admin/dcr/cycles/cycle1/links/link1/resolve", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: "仲裁原因" }),
  });
}

describe("POST cycle dispute resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockImplementation(async (
      _cycleId: string,
      _linkId: string,
      _action: string,
      _reason: string,
      onResolved: (tx: unknown, result: unknown) => Promise<void>,
    ) => {
      const result = { cycleStatus: "ACTIVE", linkStatus: "IN_PROGRESS", participantIds: ["a", "b", "c"] };
      await onResolved({ moderationAction: { create: mocks.moderationCreate }, auditLog: { create: vi.fn() } }, result);
      return result;
    });
  });

  it("resumes a disputed link and audits and notifies all participants", async () => {
    const response = await POST(request("resume"), { params: { cycleId: "cycle1", linkId: "link1" } });
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("cycle1", "link1", "resume", "仲裁原因", expect.any(Function));
    expect(mocks.moderationCreate).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      "admin",
      "RESUME",
      "MUTUAL_AID_CYCLE",
      "cycle1",
      expect.objectContaining({ linkId: "link1" }),
      undefined,
      expect.anything(),
    );
    expect(mocks.notify).toHaveBeenCalledWith(["a", "b", "c"], expect.objectContaining({ title: "互助循环争议已处理" }));
  });

  it("rejects an unsupported operation", async () => {
    const response = await POST(request("delete"), { params: { cycleId: "cycle1", linkId: "link1" } });
    expect(response.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
