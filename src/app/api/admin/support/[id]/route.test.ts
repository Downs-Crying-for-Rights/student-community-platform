import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  ticketFindFirst: vi.fn(), ticketFindUniqueOrThrow: vi.fn(), ticketUpdate: vi.fn(), ticketUpdateMany: vi.fn(), userFindUnique: vi.fn(),
  messageCreate: vi.fn(), transaction: vi.fn(), rateLimit: vi.fn(), scan: vi.fn(),
  audit: vi.fn(), notify: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: {
  supportTicket: { findFirst: mocks.ticketFindFirst, findUniqueOrThrow: mocks.ticketFindUniqueOrThrow, update: mocks.ticketUpdate, updateMany: mocks.ticketUpdateMany },
  supportTicketMessage: { create: mocks.messageCreate },
  user: { findUnique: mocks.userFindUnique },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scan }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/notification", () => ({ createNotification: mocks.notify }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { PATCH, POST } from "./route";

describe("/api/admin/support/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", phone: "13800000000" } } as never);
    mocks.rateLimit.mockResolvedValue(null); mocks.scan.mockResolvedValue([]);
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({
       supportTicket: { findFirst: mocks.ticketFindFirst, findUniqueOrThrow: mocks.ticketFindUniqueOrThrow, update: mocks.ticketUpdate, updateMany: mocks.ticketUpdateMany },
      supportTicketMessage: { create: mocks.messageCreate },
    }));
  });

  it("rejects moderator access", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "mod-1", role: "MODERATOR", phone: "13800000000" } } as never);
    const response = await POST(new NextRequest("http://localhost/api/admin/support/ticket-1", { method: "POST", body: JSON.stringify({ content: "reply" }) }), { params: { id: "ticket-1" } });
    expect(response.status).toBe(403);
    expect(mocks.ticketFindFirst).not.toHaveBeenCalled();
  });

  it("notifies the owner after a staff reply without auditing message content", async () => {
    mocks.ticketFindFirst.mockResolvedValue({ id: "ticket-1", requesterId: "user-1", status: "OPEN" });
    mocks.messageCreate.mockResolvedValue({ id: "message-1" }); mocks.ticketUpdate.mockResolvedValue({});
    const response = await POST(new NextRequest("http://localhost/api/admin/support/ticket-1", { method: "POST", body: JSON.stringify({ content: "private staff reply" }) }), { params: { id: "ticket-1" } });
    expect(response.status).toBe(201);
    expect(mocks.notify).toHaveBeenCalledWith("user-1", "SYSTEM", expect.any(String), expect.any(String), "/support/ticket-1");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private staff reply");
  });

  it("changes status and emits a content-free status notification", async () => {
    mocks.ticketFindFirst.mockResolvedValue({ id: "ticket-1", requesterId: "user-1", status: "OPEN", assignedToId: null });
    mocks.ticketUpdate.mockResolvedValue({ id: "ticket-1", status: "RESOLVED", assignedTo: null });
    const response = await PATCH(new NextRequest("http://localhost/api/admin/support/ticket-1", { method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) }), { params: { id: "ticket-1" } });
    expect(response.status).toBe(200);
    expect(mocks.ticketUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED", resolvedAt: expect.any(Date) }) }));
    expect(mocks.notify).toHaveBeenCalledWith("user-1", "SYSTEM", expect.any(String), expect.stringContaining("已解决"), "/support/ticket-1");
  });

  it("拒绝重复裁决已解决的处罚申诉", async () => {
    mocks.ticketFindFirst.mockResolvedValue({
      id: "ticket-1", requesterId: "user-1", status: "RESOLVED", assignedToId: "admin-1",
      kind: "PUNISHMENT_APPEAL", punishmentId: "punishment-1",
    });
    const response = await PATCH(new NextRequest("http://localhost/api/admin/support/ticket-1", {
      method: "PATCH",
      body: JSON.stringify({ appealDecision: "REJECT", reviewNote: "维持原处罚" }),
    }), { params: { id: "ticket-1" } });

    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("工作人员不能回复已解决的处罚申诉", async () => {
    mocks.ticketFindFirst.mockResolvedValue({ id: "ticket-1", requesterId: "user-1", status: "RESOLVED", kind: "PUNISHMENT_APPEAL" });
    const response = await POST(new NextRequest("http://localhost/api/admin/support/ticket-1", {
      method: "POST",
      body: JSON.stringify({ content: "再次回复" }),
    }), { params: { id: "ticket-1" } });

    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
