import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import svgCaptcha from "svg-captcha";
import sharp from "sharp";
import redis from "@/lib/redis";

export type CaptchaPurpose = "login-email" | "login-password" | "register";

const CAPTCHA_TTL_SECONDS = 5 * 60;
const PROOF_TTL_SECONDS = 2 * 60;
const CAPTCHA_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function take(key: string): Promise<string | null> {
  const value = await redis.eval(
    'local value = redis.call("GET", KEYS[1]); if value then redis.call("DEL", KEYS[1]) end; return value',
    1,
    key,
  );
  return typeof value === "string" ? value : null;
}

async function buildCaptchaImage(): Promise<{ answer: string; image: string }> {
  const captcha = svgCaptcha.create({
    size: 5,
    charPreset: CAPTCHA_ALPHABET,
    width: 145,
    height: 48,
    fontSize: 26,
    color: true,
    noise: 3,
    background: "#f8fafc",
  });
  const png = await sharp(Buffer.from(captcha.data)).png().toBuffer();
  return {
    answer: captcha.text,
    image: `data:image/png;base64,${png.toString("base64")}`,
  };
}

export async function issueCaptcha(purpose: CaptchaPurpose) {
  const id = randomToken(18);
  const { answer, image } = await buildCaptchaImage();
  await redis.set(`captcha:challenge:${id}`, `${purpose}:${answer}`, "EX", CAPTCHA_TTL_SECONDS);
  return {
    captchaId: id,
    image,
    expiresIn: CAPTCHA_TTL_SECONDS,
  };
}

export async function verifyCaptcha(
  captchaId: unknown,
  captchaCode: unknown,
  purpose: CaptchaPurpose,
): Promise<boolean> {
  if (typeof captchaId !== "string" || !/^[A-Za-z0-9_-]{20,40}$/.test(captchaId)) return false;
  if (typeof captchaCode !== "string" || !/^[A-Za-z0-9]{5}$/.test(captchaCode)) return false;
  const stored = await take(`captcha:challenge:${captchaId}`);
  return Boolean(stored && safeEqual(stored, `${purpose}:${captchaCode.toUpperCase()}`));
}

export async function issueCaptchaProof(purpose: CaptchaPurpose): Promise<string> {
  const proof = randomToken();
  await redis.set(`captcha:proof:${digest(proof)}`, purpose, "EX", PROOF_TTL_SECONDS);
  return proof;
}

export async function validateCaptchaProof(
  proof: unknown,
  purpose: CaptchaPurpose,
  consume = true,
): Promise<boolean> {
  if (typeof proof !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(proof)) return false;
  const key = `captcha:proof:${digest(proof)}`;
  const stored = consume ? await take(key) : await redis.get(key);
  return stored === purpose;
}

export async function markEmailCaptchaVerified(email: string): Promise<void> {
  await redis.set(`captcha:email:${digest(email.trim().toLowerCase())}`, "1", "EX", PROOF_TTL_SECONDS);
}

export async function consumeEmailCaptchaVerified(email: string): Promise<boolean> {
  return (await take(`captcha:email:${digest(email.trim().toLowerCase())}`)) === "1";
}

export async function markRecentRegistration(userId: string): Promise<void> {
  await redis.set(`captcha:recent-registration:${userId}`, "1", "EX", PROOF_TTL_SECONDS);
}

export async function consumeRecentRegistration(userId: string): Promise<boolean> {
  return (await take(`captcha:recent-registration:${userId}`)) === "1";
}

export function captchaTargetKey(value: string): string {
  return digest(value.trim().toLowerCase());
}
