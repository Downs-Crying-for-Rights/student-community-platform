import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCaseFindUnique = vi.fn();
const mockMessageFindMany = vi.fn();
const mockMessageCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    case: { findUnique: (...args: unknown[]) => mockCaseFindUnique(...args) },
    message: {
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
      create: (...args: unknown[]) => mockMessageCreate(...args),
    },
  },
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

function makeGet(id: string) {
  return new NextRequest("http://localhost:3000/api/cases/" + id + "/messages", { method: "GET" });
}
function makePost(id: string, body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/cases/" + id + "/messages", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const base = {
  id: "case1",
  status: "IN_PROGRESS",
  submitterId: "user1",
  handlerId: "helper1",
  handlers: [{ userId: "helper1" }],
};

describe("GET /api/cases/[id]/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when not logged in", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../[id]/messages/route");
    const res = await GET(makeGet("case1"), ctx("case1"));
    expect(res.status).toBe(401);
  });

  it("404 when case not found", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue(null);
    const { GET } = await import("../[id]/messages/route");
    expect((await GET(makeGet("case1"), ctx("case1"))).status).toBe(404);
  });

  it("403 when user has no access", async () => {
    setSession("other", "USER");
    mockCaseFindUnique.mockResolvedValue(base);
    const { GET } = await import("../[id]/messages/route");
    expect((await GET(makeGet("case1"), ctx("case1"))).status).toBe(403);
  });

  it("submitter can get messages", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue(base);
    mockMessageFindMany.mockResolvedValue([
      { id: "m1", content: "hi", isAnonymous: true, senderId: "user1", createdAt: new Date() },
    ]);
    const { GET } = await import("../[id]/messages/route");
    const res = await GET(makeGet("case1"), ctx("case1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.messages).toHaveLength(1);
  });

  it("handler via CaseHandler can get messages", async () => {
    setSession("helper1", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue(base);
    mockMessageFindMany.mockResolvedValue([]);
    const { GET } = await import("../[id]/messages/route");
    expect((await GET(makeGet("case1"), ctx("case1"))).status).toBe(200);
  });

  it("additional handler via CaseHandler can get messages", async () => {
    setSession("helper2", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({
      ...base,
      handlers: [{ userId: "helper1" }, { userId: "helper2" }],
    });
    mockMessageFindMany.mockResolvedValue([]);
    const { GET } = await import("../[id]/messages/route");
    expect((await GET(makeGet("case1"), ctx("case1"))).status).toBe(200);
  });

  it("ADMIN can get any case messages", async () => {
    setSession("admin1", "ADMIN");
    mockCaseFindUnique.mockResolvedValue(base);
    mockMessageFindMany.mockResolvedValue([]);
    const { GET } = await import("../[id]/messages/route");
    expect((await GET(makeGet("case1"), ctx("case1"))).status).toBe(200);
  });

  it("SUPER_ADMIN can get any case messages", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockCaseFindUnique.mockResolvedValue(base);
    mockMessageFindMany.mockResolvedValue([]);
    const { GET } = await import("../[id]/messages/route");
    expect((await GET(makeGet("case1"), ctx("case1"))).status).toBe(200);
  });

  it("messages ordered by createdAt asc", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue(base);
    mockMessageFindMany.mockResolvedValue([]);
    const { GET } = await import("../[id]/messages/route");
    await GET(makeGet("case1"), ctx("case1"));
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: "case1" }, orderBy: { createdAt: "asc" } }),
    );
  });
});

describe("POST /api/cases/[id]/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when not logged in", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "t" }), ctx("case1"))).status).toBe(401);
  });

  it("400 when content empty", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "" }), ctx("case1"))).status).toBe(400);
  });

  it("400 when content > 2000 chars", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "a".repeat(2001) }), ctx("case1"))).status).toBe(400);
  });

  it("404 when case not found", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue(null);
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "t" }), ctx("case1"))).status).toBe(404);
  });

  it("403 when user has no access", async () => {
    setSession("other", "USER");
    mockCaseFindUnique.mockResolvedValue(base);
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "t" }), ctx("case1"))).status).toBe(403);
  });

  it("OPENED: submitter can send supplementary info", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue({ ...base, status: "OPENED", handlerId: null, handlers: [] });
    mockMessageCreate.mockResolvedValue({ id: "m1", content: "extra", isAnonymous: true, senderId: "user1", createdAt: new Date() });
    const { POST } = await import("../[id]/messages/route");
    const res = await POST(makePost("case1", { content: "extra" }), ctx("case1"));
    expect(res.status).toBe(201);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderId: "user1", caseId: "case1", isAnonymous: true }) }),
    );
  });

  it("OPENED: non-submitter cannot send", async () => {
    setSession("helper1", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({ ...base, status: "OPENED", handlers: [{ userId: "helper1" }] });
    const { POST } = await import("../[id]/messages/route");
    const res = await POST(makePost("case1", { content: "t" }), ctx("case1"));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("OPENED");
  });

  it("CLOSED: blocked", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue({ ...base, status: "CLOSED" });
    const { POST } = await import("../[id]/messages/route");
    const res = await POST(makePost("case1", { content: "t" }), ctx("case1"));
    expect(res.status).toBe(400);
  });

  it("submitter sends with isAnonymous=true (group mode)", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue(base);
    mockMessageCreate.mockResolvedValue({ id: "m1", content: "hi", isAnonymous: true, senderId: "user1", createdAt: new Date() });
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "hi" }), ctx("case1"))).status).toBe(201);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderId: "user1", caseId: "case1", isAnonymous: true }) }),
    );
  });

  it("handler sends with isAnonymous=true (group mode)", async () => {
    setSession("helper1", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue(base);
    mockMessageCreate.mockResolvedValue({ id: "m1", content: "ok", isAnonymous: true, senderId: "helper1", createdAt: new Date() });
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "ok" }), ctx("case1"))).status).toBe(201);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderId: "helper1", caseId: "case1", isAnonymous: true }) }),
    );
  });

  it("additional handler via CaseHandler can send", async () => {
    setSession("helper2", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({ ...base, handlers: [{ userId: "helper1" }, { userId: "helper2" }] });
    mockMessageCreate.mockResolvedValue({ id: "m1", content: "help", isAnonymous: true, senderId: "helper2", createdAt: new Date() });
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "help" }), ctx("case1"))).status).toBe(201);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderId: "helper2", caseId: "case1", isAnonymous: true }) }),
    );
  });

  it("IN_PROGRESS allows sending", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue({ ...base, status: "IN_PROGRESS" });
    mockMessageCreate.mockResolvedValue({ id: "m1", content: "t", isAnonymous: true, senderId: "user1", createdAt: new Date() });
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "t" }), ctx("case1"))).status).toBe(201);
  });

  it("NEED_MORE_INFO allows sending", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue({ ...base, status: "NEED_MORE_INFO" });
    mockMessageCreate.mockResolvedValue({ id: "m1", content: "info", isAnonymous: true, senderId: "user1", createdAt: new Date() });
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "info" }), ctx("case1"))).status).toBe(201);
  });

  it("ADMIN sends with isAnonymous=true", async () => {
    setSession("admin1", "ADMIN");
    mockCaseFindUnique.mockResolvedValue(base);
    mockMessageCreate.mockResolvedValue({ id: "m1", content: "admin", isAnonymous: true, senderId: "admin1", createdAt: new Date() });
    const { POST } = await import("../[id]/messages/route");
    expect((await POST(makePost("case1", { content: "admin" }), ctx("case1"))).status).toBe(201);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderId: "admin1", caseId: "case1", isAnonymous: true }) }),
    );
  });
});
