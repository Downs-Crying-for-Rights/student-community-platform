import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockTelemetryEventCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  default: {
    telemetryEvent: { create: mockTelemetryEventCreate },
  },
}));
vi.unmock("@/lib/telemetry");

let telemetry: typeof import("@/lib/telemetry");

beforeAll(async () => {
  telemetry = await import("@/lib/telemetry");
});

beforeEach(() => {
  mockTelemetryEventCreate.mockReset().mockResolvedValue({ id: "event-1" });
});

describe("telemetry privacy helpers", () => {
  it("drops query strings so sensitive parameters are never stored", () => {
    expect(telemetry.normalizeTelemetryRoute("/search?q=private-value")).toBe("/search");
  });

  it("normalizes common identifier segments but keeps route templates", () => {
    expect(telemetry.normalizeTelemetryRoute("/api/users/12345/messages")).toBe("/api/users/[id]/messages");
    expect(telemetry.normalizeTelemetryRoute("/api/users/550e8400-e29b-41d4-a716-446655440000")).toBe("/api/users/[id]");
    expect(telemetry.normalizeTelemetryRoute("/api/users/[id]")).toBe("/api/users/[id]");
    expect(telemetry.normalizeTelemetryRoute("/api/articles/private-slug", { slug: "private-slug" })).toBe("/api/articles/[slug]");
  });

  it("rejects non-route values and bounds event names", () => {
    expect(telemetry.normalizeTelemetryRoute("https://example.com/private")).toBe("/unknown");
    expect(telemetry.sanitizeTelemetryName("error\nwith\ttabs")).toBe("error with tabs");
    expect(telemetry.sanitizeTelemetryName("x".repeat(200))).toHaveLength(120);
  });

  it("keeps diagnostic text while redacting credentials", () => {
    const detail = telemetry.sanitizeTelemetryDetail("TypeError: failed password=hunter2 Authorization: Bearer abc123");
    expect(detail).toContain("TypeError: failed");
    expect(detail).not.toContain("hunter2");
    expect(detail).not.toContain("abc123");
    expect(detail).toContain("[REDACTED]");
  });

  it("persists direct telemetry calls through Prisma", async () => {
    await telemetry.trackServerTelemetry({
      type: "event",
      name: "test_event",
      route: "/test",
      force: true,
    });

    expect(mockTelemetryEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: "SERVER",
        type: "event",
        name: "test_event",
        route: "/test",
      }),
    });
  });

  it("captures returned and thrown handlers and correlates returned responses", async () => {
    const returned = telemetry.withTelemetry(async () => Response.json({
      error: "invalid",
      details: { password: "hidden", field: ["required"] },
    }, { status: 422 }), { route: "/api/items/[id]" });
    const response = await returned(new Request("https://example.test/api/items/private-value", {
      method: "POST",
      headers: { "x-request-id": "known-request" },
    }));
    expect(response.headers.get("x-request-id")).toBe("known-request");
    await vi.waitFor(() => expect(mockTelemetryEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "request",
        route: "/api/items/[id]",
        status: 422,
        metadata: expect.objectContaining({
          errorDetail: "invalid",
          errorValidation: expect.stringContaining("required"),
        }),
      }),
    }));
    expect(JSON.stringify(mockTelemetryEventCreate.mock.calls)).not.toContain("hidden");

    const thrown = telemetry.withTelemetry(async () => { throw new Error("secret body"); }, { route: "/api/items/[id]" });
    await expect(thrown(new Request("https://example.test/api/items/secret?token=nope"))).rejects.toThrow("secret body");
    await vi.waitFor(() => expect(mockTelemetryEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "request", route: "/api/items/[id]", status: 500,
        metadata: expect.objectContaining({ outcome: "thrown" }),
      }),
    }));
    expect(JSON.stringify(mockTelemetryEventCreate.mock.calls)).toContain("secret body");
    expect(JSON.stringify(mockTelemetryEventCreate.mock.calls)).not.toContain("token=nope");
  });

  it("exempts ingestion persistence while exposing logical health", async () => {
    const ingest = telemetry.withTelemetry(async () => new Response(null, { status: 204 }), {
      route: "/api/telemetry",
      persist: false,
    });
    const response = await ingest(new Request("https://example.test/api/telemetry", { method: "POST" }));
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("x-telemetry-ingestion")).toBe("accepted");
    expect(mockTelemetryEventCreate).not.toHaveBeenCalled();
  });
});
