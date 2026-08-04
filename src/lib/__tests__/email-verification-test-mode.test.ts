import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailVerificationTestMode } from "../email-verification-test-mode";

describe("email verification test mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows the fixed code only outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("EMAIL_VERIFICATION_TEST_MODE", "true");
    expect(isEmailVerificationTestMode()).toBe(true);
  });

  it("ignores the fixed-code setting in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_VERIFICATION_TEST_MODE", "true");
    expect(isEmailVerificationTestMode()).toBe(false);
  });
});
