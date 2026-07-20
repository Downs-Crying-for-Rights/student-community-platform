import { vi } from "vitest";

// Route/unit tests should not attempt background telemetry writes through their
// deliberately partial Prisma mocks. Direct telemetry persistence remains real
// and is covered by the telemetry test module, which explicitly un-mocks this.
vi.mock("@/lib/telemetry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/telemetry")>();
  return {
    ...actual,
    trackServerTelemetryLater: vi.fn(),
    recordCompletedRequest: vi.fn(),
    withTelemetry: vi.fn((handler) => handler),
  };
});
