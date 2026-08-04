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

  it("issues a short-lived graphical challenge without returning its answer", async () => {
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
    const stored = String(mocks.set.mock.calls[0][1]);
    const answer = stored.split(":")[1];
    const image = Buffer.from(challenge.image.split(",")[1], "base64");
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.includes(Buffer.from(answer))).toBe(false);
    expect(image.toString("utf8")).not.toContain("<text");
  });

  it("consumes a challenge and binds it to its purpose", async () => {
    mocks.eval.mockResolvedValueOnce("login-password:AB23C").mockResolvedValueOnce(null);
    await expect(verifyCaptcha("A".repeat(24), "ab23c", "login-password")).resolves.toBe(true);
    await expect(verifyCaptcha("A".repeat(24), "AB23C", "login-password")).resolves.toBe(false);
  });

  it("issues and consumes a one-time login proof", async () => {
    const proof = await issueCaptchaProof("login-password", "User@example.com");
    expect(proof).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const storedProof = String(mocks.set.mock.calls[0][1]);
    expect(JSON.parse(storedProof)).toEqual({
      purpose: "login-password",
      target: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(storedProof).not.toContain("User@example.com");
    mocks.eval.mockResolvedValueOnce(storedProof).mockResolvedValueOnce(null);
    await expect(validateCaptchaProof(proof, "login-password", "user@example.com")).resolves.toBe(true);
    await expect(validateCaptchaProof(proof, "login-password", "user@example.com")).resolves.toBe(false);
  });

  it("rejects a proof replayed for another target", async () => {
    const proof = await issueCaptchaProof("password-reset", "13800138000");
    const storedProof = String(mocks.set.mock.calls[0][1]);
    mocks.eval.mockResolvedValueOnce(storedProof);
    await expect(validateCaptchaProof(proof, "password-reset", "13900139000")).resolves.toBe(false);
  });
});
