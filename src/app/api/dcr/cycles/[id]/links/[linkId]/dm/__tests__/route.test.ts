import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  linkFindFirst: vi.fn(),
  threadUpsert: vi.fn(),
  requireConsent: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  mutualAidLink: { findFirst: mocks.linkFindFirst },
  dMThread: { upsert: mocks.threadUpsert },
} }));
vi.mock("@/lib/dm-consent", () => ({ requireDMConsent: mocks.requireConsent }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";

describe("POST /api/dcr/cycles/[id]/links/[linkId]/dm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-b", role: "USER" } } as never);
    mocks.requireConsent.mockResolvedValue(null);
    mocks.linkFindFirst.mockResolvedValue({
      id: "link-ab",
      cycleId: "cycle-1",
      fromUserId: "user-a",
      toUserId: "user-b",
    });
    mocks.threadUpsert.mockResolvedValue({ id: "thread-ab" });
    mocks.logAudit.mockResolvedValue({});
  });

  it("derives the counterpart from the authorized cycle link", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/dcr/cycles/cycle-1/links/link-ab/dm", { method: "POST" }),
      { params: { id: "cycle-1", linkId: "link-ab" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.linkFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "link-ab", cycleId: "cycle-1" }),
    }));
    expect(mocks.threadUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { participant1Id_participant2Id: { participant1Id: "user-a", participant2Id: "user-b" } },
    }));
  });

  it("does not allow an unrelated user or a link from another cycle", async () => {
    mocks.linkFindFirst.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost/api/dcr/cycles/cycle-2/links/link-ab/dm", { method: "POST" }),
      { params: { id: "cycle-2", linkId: "link-ab" } },
    );

    expect(response.status).toBe(404);
    expect(mocks.threadUpsert).not.toHaveBeenCalled();
  });

  it("requires current DM monitoring consent", async () => {
    mocks.requireConsent.mockResolvedValue({ title: "私信授权", content: "授权文本", version: 2 });

    const response = await POST(
      new NextRequest("http://localhost/api/dcr/cycles/cycle-1/links/link-ab/dm", { method: "POST" }),
      { params: { id: "cycle-1", linkId: "link-ab" } },
    );

    expect(response.status).toBe(428);
    expect(mocks.linkFindFirst).not.toHaveBeenCalled();
  });
});
