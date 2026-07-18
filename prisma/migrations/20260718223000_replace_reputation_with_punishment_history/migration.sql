CREATE TYPE "UserPunishmentType" AS ENUM ('ACCOUNT_BAN', 'POST_SHADOW_HIDE');
CREATE TYPE "UserPunishmentAction" AS ENUM ('APPLIED', 'REVOKED');

CREATE TABLE "UserPunishment" (
    "id" TEXT NOT NULL,
    "type" "UserPunishmentType" NOT NULL,
    "action" "UserPunishmentAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    CONSTRAINT "UserPunishment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserPunishment_userId_createdAt_idx" ON "UserPunishment"("userId", "createdAt");
CREATE INDEX "UserPunishment_operatorId_createdAt_idx" ON "UserPunishment"("operatorId", "createdAt");
CREATE INDEX "UserPunishment_type_action_idx" ON "UserPunishment"("type", "action");

ALTER TABLE "UserPunishment" ADD CONSTRAINT "UserPunishment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPunishment" ADD CONSTRAINT "UserPunishment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "UserPunishment" ("id", "type", "action", "reason", "details", "createdAt", "userId", "operatorId")
SELECT
    'legacy-' || audit."id",
    CASE audit."action"
        WHEN 'SHADOW_BAN' THEN 'POST_SHADOW_HIDE'::"UserPunishmentType"
        ELSE 'ACCOUNT_BAN'::"UserPunishmentType"
    END,
    CASE audit."action"
        WHEN 'USER_UNBAN' THEN 'REVOKED'::"UserPunishmentAction"
        ELSE 'APPLIED'::"UserPunishmentAction"
    END,
    COALESCE(NULLIF(audit."details"->>'reason', ''), '历史审计记录导入'),
    jsonb_build_object('sourceType', 'AUDIT_LOG', 'auditLogId', audit."id"),
    audit."createdAt",
    audit."targetId",
    audit."operatorId"
FROM "AuditLog" AS audit
JOIN "User" AS target ON target."id" = audit."targetId"
WHERE audit."targetType" = 'USER'
  AND audit."action" IN ('USER_BAN', 'SHADOW_BAN', 'USER_UNBAN');

ALTER TABLE "HelpSession" DROP COLUMN "rewardGrantedAt";
ALTER TABLE "User" DROP COLUMN "reputationScore";
