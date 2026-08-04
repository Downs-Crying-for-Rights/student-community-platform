import { afterEach, describe, expect, it, vi } from "vitest";
import { isSmsTestMode } from "../test-mode";

describe("SMS test mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows the fixed-code provider only outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SMS_TEST_MODE", "true");
    expect(isSmsTestMode()).toBe(true);
  });

  it("ignores SMS_TEST_MODE=true in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMS_TEST_MODE", "true");
    expect(isSmsTestMode()).toBe(false);
  });
});
