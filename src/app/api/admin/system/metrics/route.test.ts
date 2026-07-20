import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), collect: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/system-metrics", () => ({ collectSystemMetrics: mocks.collect }));

const url = "http://localhost/api/admin/system/metrics";

describe("GET /api/admin/system/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collect.mockResolvedValue({ collectedAt: "2026-07-21T00:00:00.000Z" });
  });

  it("requires SUPER_ADMIN", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    const { GET } = await import("./route");
    expect((await GET(new NextRequest(url), { params: {} })).status).toBe(403);
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("returns live metrics without caching", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(url), { params: {} });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ collectedAt: "2026-07-21T00:00:00.000Z" });
  });

  it("does not expose collector errors", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    mocks.collect.mockRejectedValue(new Error("/sys/secret/path"));
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(url), { params: {} });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("/sys/secret/path");
  });
});
