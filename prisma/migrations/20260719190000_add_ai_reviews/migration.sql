CREATE TYPE "AiReviewStatus" AS ENUM ('COMPLETED', 'FAILED', 'BLOCKED', 'STALE');
CREATE TYPE "AiReviewDecision" AS ENUM ('APPROVE', 'REJECT', 'NEED_MORE_INFO', 'MANUAL_REVIEW');

CREATE TABLE "AiReview" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetVersion" TEXT NOT NULL,
    "status" "AiReviewStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "riskLevel" TEXT,
    "confidence" DOUBLE PRECISION,
    "recommendation" "AiReviewDecision",
    "result" JSONB,
    "inputHash" TEXT NOT NULL,
    "redactionCount" INTEGER NOT NULL DEFAULT 0,
    "containsPrivateData" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AiReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiReview_feature_targetType_targetId_targetVersion_model_key"
ON "AiReview"("feature", "targetType", "targetId", "targetVersion", "model");
CREATE INDEX "AiReview_targetType_targetId_createdAt_idx" ON "AiReview"("targetType", "targetId", "createdAt");
CREATE INDEX "AiReview_status_createdAt_idx" ON "AiReview"("status", "createdAt");
CREATE INDEX "AiReview_requestedById_createdAt_idx" ON "AiReview"("requestedById", "createdAt");

ALTER TABLE "AiReview" ADD CONSTRAINT "AiReview_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
