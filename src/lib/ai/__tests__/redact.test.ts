import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/redis", () => ({ default: {} }));

import { aiInputHash, aiProviderUserId, containsUnredactedPii, redactForAi } from "../redact";

describe("AI outbound redaction", () => {
  it("redacts contact details, identity numbers, student IDs, URLs, and internal IDs", () => {
    const input = "电话13800138000，身份证11010519491231002X，邮箱a@example.com，微信 test_12345，学号20240001，https://example.com，cm123456789012345678901";
    const result = redactForAi(input);

    expect(result.text).not.toContain("13800138000");
    expect(result.text).not.toContain("11010519491231002X");
    expect(result.text).not.toContain("a@example.com");
    expect(result.text).not.toContain("test_12345");
    expect(result.text).not.toContain("20240001");
    expect(result.text).not.toContain("https://example.com");
    expect(result.text).not.toContain("cm123456789012345678901");
    expect(result.redactionCount).toBeGreaterThanOrEqual(6);
  });

  it("blocks PII patterns that the redactor did not remove", () => {
    expect(redactForAi("我在高一3班").text).toBe("我在[CLASS]");
    expect(containsUnredactedPii("我在高一3班")).toBe(true);
    expect(containsUnredactedPii("[PHONE] [EMAIL]")).toBe(false);
  });

  it("uses keyed hashes and provider-safe user IDs", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    expect(aiInputHash("same")).toHaveLength(64);
    expect(aiProviderUserId("user-id")).toMatch(/^u_[a-f0-9]{32}$/);
  });
});
