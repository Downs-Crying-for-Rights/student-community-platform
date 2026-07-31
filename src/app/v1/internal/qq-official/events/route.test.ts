import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  process: vi.fn(),
}));

vi.mock("@/lib/qq-official", () => ({ getQQOfficialConfig: mocks.config }));
vi.mock("@/lib/qq-official-events", () => ({ processQQOfficialEvent: mocks.process }));

function request(token = "internal-secret", body: unknown = { op: 0 }) {
  return new Request("http://localhost:3000/v1/internal/qq-official/events", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /v1/internal/qq-official/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_TOKEN = "internal-secret";
    mocks.config.mockReturnValue({ enabled: true, configured: true });
    mocks.process.mockResolvedValue({ status: "DELIVERED" });
  });

  it("rejects callers without the internal bearer", async () => {
    const { POST } = await import("./route");
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("forwards trusted websocket dispatches to the shared processor", async () => {
    const payload = { op: 0, id: "event-1", t: "C2C_MESSAGE_CREATE", d: {} };
    const { POST } = await import("./route");
    const response = await POST(request("internal-secret", payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "DELIVERED" });
    expect(mocks.process).toHaveBeenCalledWith(payload);
  });

  it.each([
    ["INVALID", 400],
    ["IN_PROGRESS", 409],
    ["REPLY_FAILED", 502],
  ])("maps %s to HTTP %s", async (result, status) => {
    mocks.process.mockResolvedValue({ status: result });
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(status);
  });
});
