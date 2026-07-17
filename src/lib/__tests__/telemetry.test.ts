import { beforeAll, describe, expect, it, vi } from "vitest";

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

describe("telemetry privacy helpers", () => {
  it("drops query strings so sensitive parameters are never stored", () => {
    expect(telemetry.normalizeTelemetryRoute("/search?q=private-value")).toBe("/search");
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
    mockTelemetryEventCreate.mockResolvedValue({ id: "event-1" });

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
});
