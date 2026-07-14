import { describe, expect, it } from "vitest";
import { normalizeTelemetryRoute, sanitizeTelemetryName } from "@/lib/telemetry";

describe("telemetry privacy helpers", () => {
  it("drops query strings so sensitive parameters are never stored", () => {
    expect(normalizeTelemetryRoute("/search?q=private-value")).toBe("/search");
  });

  it("rejects non-route values and bounds event names", () => {
    expect(normalizeTelemetryRoute("https://example.com/private")).toBe("/unknown");
    expect(sanitizeTelemetryName("error\nwith\ttabs")).toBe("error with tabs");
    expect(sanitizeTelemetryName("x".repeat(200))).toHaveLength(120);
  });
});
