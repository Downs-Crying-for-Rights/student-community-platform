import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { logAudit, AuditAction } from "@/lib/audit";
import { trackServerTelemetryLater } from "@/lib/telemetry";
import { getAiConfig } from "@/lib/ai/config";
import { requestDeepSeekReview, AiProviderError } from "@/lib/ai/deepseek";
import { aiReviewTargetSchema } from "@/lib/ai/schemas";
import { aiInputHash, aiProviderUserId, containsUnredactedPii, redactForAi } from "@/lib/ai/redact";
import { reviewSystemPrompt } from "@/lib/ai/prompts";
import { loadAiReviewTarget } from "@/lib/ai/review-target";

export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  const parsedType = aiReviewTargetSchema.safeParse(context.params.targetType);
  if (!parsedType.success) return NextResponse.json({ error: "不支持的 AI 审核类型" }, { status: 400 });

  const limited = await enforceRateLimit(`ai-review:${req.user.id}`, 10, 60_000);
  if (limited) {
    const retryAfter = Math.max(1, Math.ceil((limited.result.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const target = await loadAiReviewTarget(parsedType.data, context.params.id);
  if (!target) return NextResponse.json({ error: "审核目标不存在" }, { status: 404 });

  const config = getAiConfig();
  const model = target.complex ? config.complexModel : config.defaultModel;
  const rawPayload = JSON.stringify(target.payload);
  const redacted = redactForAi(rawPayload);
  const inputHash = aiInputHash(redacted.text);

  const cached = await prisma.aiReview.findUnique({
    where: {
      feature_targetType_targetId_targetVersion_model: {
        feature: target.feature, targetType: target.targetType, targetId: target.targetId,
        targetVersion: target.targetVersion, model,
      },
    },
  });
  if (cached?.status === "COMPLETED" && cached.result && (!cached.expiresAt || cached.expiresAt > new Date())) {
    return NextResponse.json({ review: cached, cached: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  await logAudit(req.user.id, AuditAction.AI_REVIEW_REQUEST, target.targetType, target.targetId, {
    feature: target.feature, model, containsPrivateData: target.containsPrivateData,
  });

  if (containsUnredactedPii(redacted.text)) {
    const blocked = await prisma.aiReview.upsert({
      where: { feature_targetType_targetId_targetVersion_model: { feature: target.feature, targetType: target.targetType, targetId: target.targetId, targetVersion: target.targetVersion, model } },
      create: {
        feature: target.feature, targetType: target.targetType, targetId: target.targetId, targetVersion: target.targetVersion,
        status: "BLOCKED", provider: "deepseek", model, inputHash, redactionCount: redacted.redactionCount,
        containsPrivateData: target.containsPrivateData, requestedById: req.user.id,
      },
      update: { status: "BLOCKED", inputHash, redactionCount: redacted.redactionCount, requestedById: req.user.id },
    });
    await logAudit(req.user.id, AuditAction.AI_REVIEW_BLOCKED, target.targetType, target.targetId, { feature: target.feature, reason: "PII_REMAINS" });
    return NextResponse.json({ error: "脱敏后仍检测到个人信息，已阻止发送给 AI", review: blocked }, { status: 422 });
  }

  const startedAt = Date.now();
  try {
    const response = await requestDeepSeekReview({
      systemPrompt: reviewSystemPrompt(target.targetType), content: redacted.text,
      userId: aiProviderUserId(req.user.id), complex: target.complex,
    });
    if (containsUnredactedPii(JSON.stringify(response.result))) {
      throw new AiProviderError("AI_OUTPUT_CONTAINS_PII", 502);
    }
    const completed = await prisma.aiReview.upsert({
      where: { feature_targetType_targetId_targetVersion_model: { feature: target.feature, targetType: target.targetType, targetId: target.targetId, targetVersion: target.targetVersion, model: response.model } },
      create: {
        feature: target.feature, targetType: target.targetType, targetId: target.targetId, targetVersion: target.targetVersion,
        status: "COMPLETED", provider: "deepseek", model: response.model, riskLevel: response.result.riskLevel,
        confidence: response.result.confidence, recommendation: response.result.recommendation,
        result: response.result as Prisma.InputJsonValue, inputHash, redactionCount: redacted.redactionCount,
        containsPrivateData: target.containsPrivateData, requestedById: req.user.id, completedAt: new Date(),
        expiresAt: target.containsPrivateData ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
      },
      update: {
        status: "COMPLETED", riskLevel: response.result.riskLevel, confidence: response.result.confidence,
        recommendation: response.result.recommendation, result: response.result as Prisma.InputJsonValue,
        inputHash, redactionCount: redacted.redactionCount, containsPrivateData: target.containsPrivateData,
        requestedById: req.user.id, completedAt: new Date(),
        expiresAt: target.containsPrivateData ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
      },
    });
    await logAudit(req.user.id, AuditAction.AI_REVIEW_COMPLETE, target.targetType, target.targetId, {
      feature: target.feature, model: response.model, riskLevel: response.result.riskLevel,
      recommendation: response.result.recommendation, confidence: response.result.confidence,
    });
    trackServerTelemetryLater({
      type: "event", name: "ai_review_complete", route: "/api/ai/reviews/[targetType]/[id]",
      duration: Date.now() - startedAt, userId: req.user.id,
      metadata: { feature: target.feature, model: response.model, private: target.containsPrivateData, tokens: response.usage?.total_tokens ?? null },
    });
    return NextResponse.json({ review: completed, cached: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : "AI_UNKNOWN_ERROR";
    const status = error instanceof AiProviderError ? error.status : 500;
    await prisma.aiReview.upsert({
      where: { feature_targetType_targetId_targetVersion_model: { feature: target.feature, targetType: target.targetType, targetId: target.targetId, targetVersion: target.targetVersion, model } },
      create: {
        feature: target.feature, targetType: target.targetType, targetId: target.targetId, targetVersion: target.targetVersion,
        status: "FAILED", provider: "deepseek", model, inputHash, redactionCount: redacted.redactionCount,
        containsPrivateData: target.containsPrivateData, requestedById: req.user.id,
      },
      update: { status: "FAILED", inputHash, redactionCount: redacted.redactionCount, requestedById: req.user.id },
    });
    await logAudit(req.user.id, AuditAction.AI_REVIEW_FAILED, target.targetType, target.targetId, { feature: target.feature, code });
    return NextResponse.json({ error: code === "AI_DISABLED" ? "AI 审核服务尚未启用" : "AI 审核暂时不可用", code }, { status });
  }
}, "MODERATOR", { captureAllTelemetry: true });
