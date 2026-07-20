import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
vi.mock("next-auth/next", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { recordCompletedRequest } from "@/lib/telemetry";
import { withAuth, withOptionalAuth } from "@/lib/rbac";

const completed = vi.mocked(recordCompletedRequest);
const request = () => new NextRequest("https://example.test/api/posts/550e8400-e29b-41d4-a716-446655440000?secret=no", {
  headers: { "x-request-id": "test-request" },
});

describe("RBAC request completion telemetry", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    completed.mockClear();
  });

  it.each([
    [null, 401],
    [{ user: { id: "user-1", role: "USER", isBanned: true } }, 403],
    [{ user: { id: "user-1", role: "USER", profileCompletionRequired: true } }, 403],
  ])("captures auth gate exits", async (session, status) => {
    getServerSession.mockResolvedValue(session);
    const response = await withAuth(async () => NextResponse.json({ ok: true }))(request(), { params: {} });
    expect(response.status).toBe(status);
    expect(response.headers.get("x-request-id")).toBe("test-request");
    expect(completed).toHaveBeenCalledWith(expect.anything(), response, expect.any(Number), expect.objectContaining({ requestId: "test-request" }));
  });

  it("captures role denial and handler throws", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-1", role: "USER" } });
    const denied = await withAuth(async () => NextResponse.json({ ok: true }), "ADMIN")(request(), { params: {} });
    expect(denied.status).toBe(403);
    expect(completed).toHaveBeenLastCalledWith(expect.anything(), denied, expect.any(Number), expect.objectContaining({ userId: "user-1" }));

    const throwing = withAuth(async () => { throw new Error("handler failed"); });
    await expect(throwing(request(), { params: {} })).rejects.toThrow("handler failed");
    expect(completed).toHaveBeenLastCalledWith(expect.anything(), undefined, expect.any(Number), expect.objectContaining({ thrown: true }));
  });

  it("captures anonymous optional-auth responses", async () => {
    getServerSession.mockResolvedValue(null);
    const response = await withOptionalAuth(async () => NextResponse.json({ ok: true }))(request(), { params: {} });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("test-request");
    expect(completed).toHaveBeenCalledOnce();
  });

  it("passes through disabled telemetry persistence for polling routes", async () => {
    getServerSession.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const response = await withAuth(
      async () => NextResponse.json({ ok: true }),
      "SUPER_ADMIN",
      { route: "/api/admin/system/metrics", persist: false },
    )(request(), { params: {} });
    expect(completed).toHaveBeenCalledWith(expect.anything(), response, expect.any(Number), expect.objectContaining({
      route: "/api/admin/system/metrics",
      persist: false,
    }));
  });
});
