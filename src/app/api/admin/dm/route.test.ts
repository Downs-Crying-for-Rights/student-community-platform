import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { dMThread: { findMany: mocks.findMany } } }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET } from "./route";

describe("GET /api/admin/dm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin", role: "ADMIN" } } as never);
    mocks.findMany.mockResolvedValue([]);
  });

  it("excludes platform announcement threads before pagination", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/dm"), { params: {} });
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isSystemReadOnly: false,
        participant1Id: { not: "system-announcements" },
        participant2Id: { not: "system-announcements" },
      },
      take: 100,
    }));
  });

  it("does not allow threadId to bypass the system-thread exclusion", async () => {
    await GET(new NextRequest("http://localhost/api/admin/dm?threadId=system-thread"), { params: {} });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "system-thread", isSystemReadOnly: false }),
    }));
  });
});
