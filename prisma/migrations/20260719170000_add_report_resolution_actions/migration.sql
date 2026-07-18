CREATE TYPE "ReportResolutionAction" AS ENUM (
    'NONE',
    'DELETE_TARGET',
    'BAN_RESPONSIBLE_USER',
    'SHADOW_HIDE_RESPONSIBLE_USER',
    'DELETE_TARGET_AND_BAN_USER',
    'DELETE_TARGET_AND_SHADOW_HIDE_USER'
);

ALTER TABLE "Report"
ADD COLUMN "resolutionAction" "ReportResolutionAction",
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedById" TEXT;

CREATE INDEX "Report_resolvedById_idx" ON "Report"("resolvedById");
