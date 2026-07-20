import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  claim: vi.fn(),
  siteContentFindMany: vi.fn(),
  siteContentUpsert: vi.fn(),
}));

vi.mock("@/lib/qq-registration", () => ({
  createPendingQQRegistration: mocks.create,
  claimQQRegistrationRateLimit: mocks.claim,
}));
vi.mock("@/lib/rate-limiter", () => ({
  rateLimitKeyForIP: (ip: string) => `hashed:${ip}`,
}));
vi.mock("@/lib/prisma", () => ({ default: { siteContent: { findMany: mocks.siteContentFindMany, upsert: mocks.siteContentUpsert } } }));

function request(body: unknown) {
  return new Request("http://localhost/api/auth/register/qq", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("QQ bot registration issuance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claim.mockResolvedValue(true);
    mocks.siteContentFindMany.mockResolvedValue([
      { key: "user-agreement", revision: 1 },
      { key: "privacy-policy", revision: 1 },
    ]);
  });

  it("issues only a bot credential and no-store response", async () => {
    const credential = `qqg_${"A".repeat(43)}`;
    mocks.create.mockResolvedValue({ ok: true, credential, expiresAt: new Date("2026-07-20T12:15:00.000Z") });
    const { POST } = await import("./route");
    const revisions = { "user-agreement": 1, "privacy-policy": 1 };
    const response = await POST(request({ username: "New_User", password: "password-123", agreementRevisions: revisions }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      credential,
      command: `注册 ${credential}`,
      expiresAt: "2026-07-20T12:15:00.000Z",
    });
    expect(mocks.create).toHaveBeenCalledWith("new_user", "password-123", revisions);
  });

  it("rejects invalid usernames before hashing a password", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ username: "中文名", password: "password-123", agreementRevisions: { "user-agreement": 1 } }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("honors the unauthenticated issuance rate limit", async () => {
    mocks.claim.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    expect((await POST(request({ username: "new_user", password: "password-123", agreementRevisions: { "user-agreement": 1 } }))).status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
