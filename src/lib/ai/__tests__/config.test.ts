import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateAiBaseUrl } from "../config";

describe("AI provider URL validation", () => {
  it("rejects non-HTTPS URLs and embedded credentials", async () => {
    await expect(validateAiBaseUrl("http://api.deepseek.com")).rejects.toThrow("AI_CONFIG_INVALID_BASE_URL");
    await expect(validateAiBaseUrl("https://user:pass@api.deepseek.com")).rejects.toThrow("AI_CONFIG_INVALID_BASE_URL");
  });

  it("rejects localhost, private addresses, paths, and query parameters", async () => {
    await expect(validateAiBaseUrl("https://127.0.0.1")).rejects.toThrow("AI_CONFIG_INVALID_BASE_URL");
    await expect(validateAiBaseUrl("https://localhost")).rejects.toThrow("AI_CONFIG_INVALID_BASE_URL");
    await expect(validateAiBaseUrl("https://api.deepseek.com/internal")).rejects.toThrow("AI_CONFIG_INVALID_BASE_URL");
    await expect(validateAiBaseUrl("https://api.deepseek.com?target=internal")).rejects.toThrow("AI_CONFIG_INVALID_BASE_URL");
  });
});
