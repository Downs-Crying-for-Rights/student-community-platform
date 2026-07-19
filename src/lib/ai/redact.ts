import { createHmac } from "crypto";
import { PII_REGEX_PATTERNS } from "@/lib/sensitive-engine";

const RULES: Array<[RegExp, string]> = [
  [/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "[PHONE]"],
  [/\b\d{17}[\dXx]\b|\b\d{15}\b/g, "[IDENTITY_NUMBER]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]"],
  [/(?:微信|wechat|wx)\s*[:：]?\s*[a-zA-Z][-_a-zA-Z0-9]{5,19}/gi, "[CONTACT]"],
  [/(?:QQ|qq)\s*[:：]?\s*[1-9]\d{4,11}/g, "[CONTACT]"],
  [/(?:学号)\s*[:：]?\s*[a-zA-Z0-9_-]{4,24}/g, "[STUDENT_ID]"],
  [/(?:高[一二三]|初[一二三]|小[一二三四五六]|[12]\d级)\s*\d{1,2}\s*班/g, "[CLASS]"],
  [/(?:东经|西经|E|W)\s*\d{2,3}[°°]\d{1,2}['']\d{1,2}[''′]?\s*[,，]\s*(?:北纬|南纬|N|S)\s*\d{2,3}[°°]\d{1,2}['']\d{1,2}[''′]?/g, "[PRECISE_LOCATION]"],
  [/https?:\/\/[^\s)\]}]+/gi, "[URL]"],
  [/\b(?:c[a-z0-9]{20,30})\b/gi, "[INTERNAL_ID]"],
];

export function redactForAi(value: unknown) {
  let text = typeof value === "string" ? value : JSON.stringify(value);
  let redactionCount = 0;
  for (const [pattern, replacement] of RULES) {
    text = text.replace(pattern, () => {
      redactionCount += 1;
      return replacement;
    });
  }
  return { text, redactionCount };
}

export function aiInputHash(text: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AI_HASH_SECRET_MISSING");
  return createHmac("sha256", secret).update(text).digest("hex");
}

export function aiProviderUserId(userId: string) {
  return `u_${aiInputHash(userId).slice(0, 32)}`;
}

export function containsUnredactedPii(text: string) {
  return PII_REGEX_PATTERNS.some(({ pattern }) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    return new RegExp(pattern.source, flags).test(text);
  });
}
