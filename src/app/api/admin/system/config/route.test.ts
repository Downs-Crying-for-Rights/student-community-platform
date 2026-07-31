import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: { systemConfig: { findUnique: mocks.findUnique, upsert: mocks.upsert } },
}));
vi.mock("@/lib/audit", () => ({
  AuditAction: { SYSTEM_CONFIG_UPDATE: "SYSTEM_CONFIG_UPDATE" },
  AuditTargetType: { SYSTEM: "SYSTEM" },
  logAudit: mocks.audit,
}));

const url = "http://localhost/api/admin/system/config";

describe("admin system config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({ smsVerificationEnabled: false, revision: 2 });
    mocks.audit.mockResolvedValue({});
  });

  it("requires SUPER_ADMIN", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    const { GET } = await import("./route");
    expect((await GET(new NextRequest(url), { params: {} })).status).toBe(403);
  });

  it("defaults verification to enabled", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(url), { params: {} });
    expect(await response.json()).toMatchObject({ smsVerificationEnabled: true, revision: 0 });
  });

  it("persists and audits the verification setting", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { PATCH } = await import("./route");
    const response = await PATCH(new NextRequest(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smsVerificationEnabled: false }),
    }), { params: {} });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "default" },
      update: expect.objectContaining({ smsVerificationEnabled: false }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith(
      "root",
      "SYSTEM_CONFIG_UPDATE",
      "SYSTEM",
      "default",
      { smsVerificationEnabled: false, revision: 2 },
    );
  });

  it("rejects non-boolean and unknown settings", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { PATCH } = await import("./route");
    const response = await PATCH(new NextRequest(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smsVerificationEnabled: "false", extra: true }),
    }), { params: {} });
    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects enabling mandatory registration phone while QQ registration remains enabled", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    mocks.findUnique.mockResolvedValue({ qqRegistrationEnabled: true });
    const { PATCH } = await import("./route");
    const response = await PATCH(new NextRequest(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationPhoneRequired: true }),
    }), { params: {} });
    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("accepts a complete typed area policy", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const areas = {
      communityBrowse: false,
      contentCreate: true,
      communityInteract: true,
      messages: true,
      groupChat: true,
      psychology: false,
      support: false,
      profile: false,
    };
    mocks.upsert.mockResolvedValue({ phoneRequiredAreas: areas, revision: 3 });
    const { PATCH } = await import("./route");
    const response = await PATCH(new NextRequest(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneRequiredAreas: areas }),
    }), { params: {} });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ phoneRequiredAreas: areas }),
    }));
  });
});
