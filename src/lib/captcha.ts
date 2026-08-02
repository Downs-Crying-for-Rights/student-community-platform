import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
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

function buildSvg(answer: string): string {
  const glyphs = [...answer].map((character, index) => {
    const x = 18 + index * 24 + randomInt(-2, 3);
    const y = 34 + randomInt(-3, 4);
    const rotate = randomInt(-18, 19);
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#172033">${character}</text>`;
  }).join("");
  const lines = Array.from({ length: 6 }, () => (
    `<line x1="${randomInt(0, 145)}" y1="${randomInt(0, 48)}" x2="${randomInt(0, 145)}" y2="${randomInt(0, 48)}" stroke="#64748b" stroke-width="1" opacity="0.55" />`
  )).join("");
  const dots = Array.from({ length: 28 }, () => (
    `<circle cx="${randomInt(2, 143)}" cy="${randomInt(2, 46)}" r="${randomInt(1, 3)}" fill="#94a3b8" opacity="0.65" />`
  )).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="145" height="48" viewBox="0 0 145 48" role="img" aria-label="图形验证码"><rect width="145" height="48" rx="6" fill="#f8fafc"/>${dots}${lines}${glyphs}</svg>`;
}

export async function issueCaptcha(purpose: CaptchaPurpose) {
  const id = randomToken(18);
  const answer = Array.from({ length: 5 }, () => CAPTCHA_ALPHABET[randomInt(0, CAPTCHA_ALPHABET.length)]).join("");
  await redis.set(`captcha:challenge:${id}`, `${purpose}:${answer}`, "EX", CAPTCHA_TTL_SECONDS);
  return {
    captchaId: id,
    image: `data:image/svg+xml;base64,${Buffer.from(buildSvg(answer)).toString("base64")}`,
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
