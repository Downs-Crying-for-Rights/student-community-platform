import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { encryptEnvelope } from "@/lib/encrypted-envelope";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { getEnvironmentAiConfig, validateAiBaseUrl } from "@/lib/ai/config";
import { getSystemSecretKey } from "@/lib/ai/runtime-config";
import { DEFAULT_QQ_DRAFT_PROMPT, DEFAULT_REVIEW_BASE_PROMPT, DEFAULT_TARGET_INSTRUCTIONS } from "@/lib/ai/prompts";
import { aiReviewTargetSchema } from "@/lib/ai/schemas";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const targetInstructionsSchema = z.record(aiReviewTargetSchema, z.string().trim().min(20).max(10_000));
const updateSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().url().max(500),
  defaultModel: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._:/-]+$/),
  complexModel: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._:/-]+$/),
  timeoutMs: z.number().int().min(500).max(120_000),
  maxInputChars: z.number().int().min(1_000).max(100_000),
  maxOutputTokens: z.number().int().min(100).max(16_000),
  reviewBasePrompt: z.string().trim().min(100).max(20_000),
  targetInstructions: targetInstructionsSchema,
  qqDraftPrompt: z.string().trim().min(100).max(20_000),
  apiKey: z.string().trim().min(8).max(500).optional(),
}).strict();

function defaults() {
  const config = getEnvironmentAiConfig();
  return {
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    defaultModel: config.defaultModel,
    complexModel: config.complexModel,
    timeoutMs: config.timeoutMs,
    maxInputChars: config.maxInputChars,
    maxOutputTokens: config.maxOutputTokens,
    reviewBasePrompt: DEFAULT_REVIEW_BASE_PROMPT,
    targetInstructions: DEFAULT_TARGET_INSTRUCTIONS,
    qqDraftPrompt: DEFAULT_QQ_DRAFT_PROMPT,
    revision: 0,
    updatedAt: null,
    source: "environment",
    hasApiKey: Boolean(config.apiKey),
  };
}

export const GET = withAuth(async () => {
  const stored = await prisma.aiRuntimeConfig.findUnique({ where: { id: "default" } });
  if (!stored) return NextResponse.json({ config: defaults() }, { headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ config: {
    enabled: stored.enabled,
    baseUrl: stored.baseUrl,
    defaultModel: stored.defaultModel,
    complexModel: stored.complexModel,
    timeoutMs: stored.timeoutMs,
    maxInputChars: stored.maxInputChars,
    maxOutputTokens: stored.maxOutputTokens,
    reviewBasePrompt: stored.reviewBasePrompt,
    targetInstructions: stored.targetInstructions,
    qqDraftPrompt: stored.qqDraftPrompt,
    revision: stored.revision,
    updatedAt: stored.updatedAt,
    source: "database",
    hasApiKey: Boolean(stored.apiKeyCiphertext || process.env.DEEPSEEK_API_KEY),
  } }, { headers: { "Cache-Control": "private, no-store" } });
}, "SUPER_ADMIN");

export const PATCH = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "配置参数无效", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  let baseUrl: string;
  try {
    baseUrl = await validateAiBaseUrl(parsed.data.baseUrl);
  } catch {
    return NextResponse.json({ error: "API URL 必须是可解析的 HTTPS 公网根地址" }, { status: 400 });
  }

  const { apiKey, ...plain } = parsed.data;
  const encrypted = apiKey ? encryptEnvelope(apiKey, getSystemSecretKey(), 1, "ai-runtime-api-key") : null;
  const secretData = encrypted ? {
    apiKeyCiphertext: encrypted.ciphertext,
    apiKeyIv: encrypted.iv,
    apiKeyAuthTag: encrypted.authTag,
    apiKeyKeyVersion: encrypted.keyVersion,
  } : {};
  const stored = await prisma.aiRuntimeConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default", ...plain, baseUrl,
      targetInstructions: plain.targetInstructions as Prisma.InputJsonValue,
      ...secretData, updatedById: req.user.id,
    },
    update: {
      ...plain, baseUrl,
      targetInstructions: plain.targetInstructions as Prisma.InputJsonValue,
      ...secretData, revision: { increment: 1 }, updatedById: req.user.id,
    },
  });
  await logAudit(req.user.id, AuditAction.AI_CONFIG_UPDATE, AuditTargetType.SYSTEM, "ai-runtime", {
    revision: stored.revision,
    fields: Object.keys(plain),
    apiKeyRotated: Boolean(apiKey),
    baseUrl,
  });
  return NextResponse.json({ success: true, revision: stored.revision }, { headers: { "Cache-Control": "private, no-store" } });
}, "SUPER_ADMIN");
