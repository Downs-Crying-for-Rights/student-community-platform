import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendAdminActionMail: mocks.send }));

function request(token: string, body: unknown) {
  return new Request("http://localhost/v1/internal/deployment-notification", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const payload = {
  release: "a".repeat(40),
  actor: "deployer",
  repository: "Downs-Crying-for-Rights/forum",
};

describe("deployment notification endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_TOKEN = "internal-secret";
    mocks.send.mockResolvedValue({ sent: true, recipientCount: 2 });
  });

  it("rejects requests without the internal bearer token", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("wrong", payload));
    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("emails administrators after a valid deployment notification", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("internal-secret", payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ notified: true, recipientCount: 2 });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      minimumRole: "ADMIN",
      subject: expect.stringContaining("aaaaaaaaaaaa"),
      actionUrl: `https://github.com/${payload.repository}/commit/${payload.release}`,
    }));
  });
});
