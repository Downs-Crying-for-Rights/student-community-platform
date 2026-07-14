import { describe, expect, it } from "vitest";
import { normalizeTelemetryRoute, sanitizeTelemetryDetail, sanitizeTelemetryName } from "@/lib/telemetry";

describe("telemetry privacy helpers", () => {
  it("drops query strings so sensitive parameters are never stored", () => {
    expect(normalizeTelemetryRoute("/search?q=private-value")).toBe("/search");
  });

  it("rejects non-route values and bounds event names", () => {
    expect(normalizeTelemetryRoute("https://example.com/private")).toBe("/unknown");
    expect(sanitizeTelemetryName("error\nwith\ttabs")).toBe("error with tabs");
    expect(sanitizeTelemetryName("x".repeat(200))).toHaveLength(120);
  });

  it("keeps diagnostic text while redacting credentials", () => {
    const detail = sanitizeTelemetryDetail("TypeError: failed password=hunter2 Authorization: Bearer abc123");
    expect(detail).toContain("TypeError: failed");
    expect(detail).not.toContain("hunter2");
    expect(detail).not.toContain("abc123");
    expect(detail).toContain("[REDACTED]");
  });
});
