CREATE TYPE "HelpSessionStatus" AS ENUM ('CLAIMED', 'IN_PROGRESS', 'EVIDENCE_PENDING', 'COMPLETED', 'CLOSED', 'DISPUTED');

ALTER TABLE "HelpSession"
ADD COLUMN "status" "HelpSessionStatus" NOT NULL DEFAULT 'CLAIMED',
ADD COLUMN "statusBeforeDispute" "HelpSessionStatus",
ADD COLUMN "requesterConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "helperConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "rewardGrantedAt" TIMESTAMP(3);

UPDATE "HelpSession" AS session
SET
  "status" = CASE task."status"::text
    WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::"HelpSessionStatus"
    WHEN 'EVIDENCE_PENDING' THEN 'EVIDENCE_PENDING'::"HelpSessionStatus"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"HelpSessionStatus"
    WHEN 'CLOSED' THEN 'CLOSED'::"HelpSessionStatus"
    WHEN 'DISPUTED' THEN 'DISPUTED'::"HelpSessionStatus"
    ELSE 'CLAIMED'::"HelpSessionStatus"
  END,
  "requesterConfirmed" = task."requesterConfirmed",
  "helperConfirmed" = task."helperConfirmed",
  "closedAt" = CASE
    WHEN task."status"::text IN ('COMPLETED', 'CLOSED') THEN COALESCE(session."closedAt", task."updatedAt")
    ELSE session."closedAt"
  END,
  "rewardGrantedAt" = CASE
    WHEN task."status"::text = 'COMPLETED' THEN COALESCE(session."closedAt", task."updatedAt")
    ELSE NULL
  END
FROM "MutualAidTask" AS task
WHERE session."taskId" = task."id";

CREATE INDEX "HelpSession_status_idx" ON "HelpSession"("status");
