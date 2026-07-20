import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
  default: { set: vi.fn(), get: vi.fn(), eval: vi.fn() },
}));

import {
  getQQOfficialAccessToken,
  getQQOfficialConfig,
  resetQQOfficialTokenForTests,
  signQQOfficialChallenge,
  verifyQQOfficialSignature,
} from "./qq-official";

const originalEnv = { ...process.env };

describe("QQ official bot", () => {
  beforeEach(() => {
    process.env.QQ_OFFICIAL_BOT_ENABLED = "true";
    process.env.QQ_OFFICIAL_BOT_APP_ID = "11111111";
    process.env.QQ_OFFICIAL_BOT_CLIENT_SECRET = "DG5g3B4j9X2KOErG";
    resetQQOfficialTokenForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("derives the callback challenge signature from the documented algorithm", () => {
    expect(signQQOfficialChallenge(
      "DG5g3B4j9X2KOErG",
      "1725442341",
      "Arq0D5A61EgUu4OxUvOp",
    )).toBe("87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706");
  });

  it("verifies signed callbacks and rejects stale timestamps", () => {
    const timestamp = "1725442341";
    const body = '{"op":0,"d":{},"t":"READY"}';
    const signature = signQQOfficialChallenge("DG5g3B4j9X2KOErG", timestamp, body);
    expect(verifyQQOfficialSignature({
      secret: "DG5g3B4j9X2KOErG", timestamp, body, signature, now: 1_725_442_341_000,
    })).toBe(true);
    expect(verifyQQOfficialSignature({
      secret: "DG5g3B4j9X2KOErG", timestamp, body, signature, now: 1_725_443_000_000,
    })).toBe(false);
  });

  it("never exposes credentials through the public config shape", () => {
    const config = getQQOfficialConfig();
    expect(config.configured).toBe(true);
    expect(config.appId).toBe("11111111");
  });

  it("exchanges and caches an access token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      access_token: "token-value",
      expires_in: "7200",
    }), { status: 200 }));
    await expect(getQQOfficialAccessToken()).resolves.toBe("token-value");
    await expect(getQQOfficialAccessToken()).resolves.toBe("token-value");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
