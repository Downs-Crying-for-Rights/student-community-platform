import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  default: { set: mocks.set, get: mocks.get, eval: mocks.eval },
}));

import {
  issueCaptcha,
  issueCaptchaProof,
  validateCaptchaProof,
  verifyCaptcha,
} from "@/lib/captcha";

describe("graphical captcha", () => {
  beforeEach(() => vi.clearAllMocks());

  it("issues a short-lived rasterized challenge without leaking its answer", async () => {
    const challenge = await issueCaptcha("register");
    expect(challenge.captchaId).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(challenge.image).toMatch(/^data:image\/png;base64,/);
    expect(challenge.expiresIn).toBe(300);
    expect(mocks.set).toHaveBeenCalledWith(
      `captcha:challenge:${challenge.captchaId}`,
      expect.stringMatching(/^register:[A-Z2-9]{5}$/),
      "EX",
      300,
    );
    const storedAnswer = (mocks.set.mock.calls[0][1] as string).split(":")[1];
    const decoded = Buffer.from(challenge.image.split(",")[1]!, "base64");
    expect(decoded.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(decoded.includes(Buffer.from(storedAnswer))).toBe(false);
  });

  it("consumes a challenge and binds it to its purpose", async () => {
    mocks.eval.mockResolvedValueOnce("login-password:AB23C").mockResolvedValueOnce(null);
    await expect(verifyCaptcha("A".repeat(24), "ab23c", "login-password")).resolves.toBe(true);
    await expect(verifyCaptcha("A".repeat(24), "AB23C", "login-password")).resolves.toBe(false);
  });

  it("issues and consumes a one-time login proof", async () => {
    const proof = await issueCaptchaProof("login-password");
    expect(proof).toMatch(/^[A-Za-z0-9_-]{32}$/);
    mocks.eval.mockResolvedValueOnce("login-password");
    await expect(validateCaptchaProof(proof, "login-password")).resolves.toBe(true);
  });
});
