import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  phoneRequired: vi.fn(),
  telemetry: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/system-config", () => ({ isPhoneRequiredForArea: mocks.phoneRequired }));
vi.mock("@/lib/telemetry", () => ({ recordCompletedRequest: mocks.telemetry }));

import { withAuth } from "@/lib/rbac";

describe("withAuth phone area enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.phoneRequired.mockResolvedValue(true);
  });

  it("blocks an unverified user before a protected handler runs", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-1", role: "USER", phone: null } });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const route = withAuth(handler);
    const response = await route(new NextRequest("http://localhost/api/chat/rooms"), { params: {} });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "PHONE_VERIFICATION_REQUIRED",
      area: "groupChat",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows a verified user without querying the area policy", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-1", role: "USER", phone: "13800138000" } });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const route = withAuth(handler);
    const response = await route(new NextRequest("http://localhost/api/chat/rooms"), { params: {} });

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(mocks.phoneRequired).not.toHaveBeenCalled();
  });

  it("never applies configurable gates to DCR or admin APIs", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN", phone: null } });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const dcrRoute = withAuth(handler);
    expect((await dcrRoute(new NextRequest("http://localhost/api/dcr/progress"), { params: {} })).status).toBe(200);
    expect(mocks.phoneRequired).not.toHaveBeenCalled();
  });
});
