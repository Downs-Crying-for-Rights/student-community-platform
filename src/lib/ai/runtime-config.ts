import "server-only";
import type { AiReviewTarget } from "./schemas";
import prisma from "@/lib/prisma";
import { decryptEnvelope } from "@/lib/encrypted-envelope";
import { getEnvironmentAiConfig, type AiConfig, validateAiBaseUrl } from "./config";
import { DEFAULT_QQ_DRAFT_PROMPT, DEFAULT_REVIEW_BASE_PROMPT, DEFAULT_TARGET_INSTRUCTIONS } from "./prompts";

function secretKey(): Buffer {
  const configured = process.env.SYSTEM_SECRET_ENCRYPTION_KEY;
  if (!configured) throw new Error("SYSTEM_SECRET_ENCRYPTION_KEY_MISSING");
  const encoding = /^[0-9a-f]{64}$/i.test(configured) ? "hex" : "base64url";
  const key = Buffer.from(configured, encoding);
  if (key.length !== 32) throw new Error("SYSTEM_SECRET_ENCRYPTION_KEY_INVALID");
  return key;
}

export function getSystemSecretKey(): Buffer {
  return secretKey();
}

export async function getAiConfig(): Promise<AiConfig> {
  const fallback = getEnvironmentAiConfig();
  const stored = await prisma.aiRuntimeConfig.findUnique({ where: { id: "default" } });
  if (!stored) return fallback;
  let apiKey = fallback.apiKey;
  if (stored.apiKeyCiphertext && stored.apiKeyIv && stored.apiKeyAuthTag && stored.apiKeyKeyVersion) {
    apiKey = decryptEnvelope({
      ciphertext: stored.apiKeyCiphertext,
      iv: stored.apiKeyIv,
      authTag: stored.apiKeyAuthTag,
      keyVersion: stored.apiKeyKeyVersion,
    }, secretKey(), "ai-runtime-api-key");
  }
  return {
    enabled: stored.enabled,
    apiKey,
    baseUrl: await validateAiBaseUrl(stored.baseUrl),
    defaultModel: stored.defaultModel,
    complexModel: stored.complexModel,
    timeoutMs: stored.timeoutMs,
    maxInputChars: stored.maxInputChars,
    maxOutputTokens: stored.maxOutputTokens,
    revision: stored.revision,
    source: "database",
  };
}

export async function getAiPrompt(target: AiReviewTarget | "QQ_DRAFT"): Promise<string> {
  const stored = await prisma.aiRuntimeConfig.findUnique({
    where: { id: "default" },
    select: { reviewBasePrompt: true, targetInstructions: true, qqDraftPrompt: true },
  });
  if (target === "QQ_DRAFT") return stored?.qqDraftPrompt || DEFAULT_QQ_DRAFT_PROMPT;
  const instructions = stored?.targetInstructions as Record<string, unknown> | undefined;
  const instruction = typeof instructions?.[target] === "string"
    ? instructions[target] as string
    : DEFAULT_TARGET_INSTRUCTIONS[target];
  return `${stored?.reviewBasePrompt || DEFAULT_REVIEW_BASE_PROMPT}\n${instruction}`;
}
