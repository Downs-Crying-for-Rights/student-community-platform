CREATE TYPE "HelpClaimStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

DROP INDEX "HelpSession_taskId_key";

CREATE TABLE "HelpClaim" (
    "id" TEXT NOT NULL,
    "status" "HelpClaimStatus" NOT NULL DEFAULT 'PENDING',
    "applicantConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "requesterConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "targetTaskId" TEXT NOT NULL,
    "offeredTaskId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "sessionId" TEXT,

    CONSTRAINT "HelpClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HelpSession_taskId_helperId_key" ON "HelpSession"("taskId", "helperId");
CREATE INDEX "HelpSession_taskId_idx" ON "HelpSession"("taskId");
CREATE UNIQUE INDEX "HelpClaim_sessionId_key" ON "HelpClaim"("sessionId");
CREATE UNIQUE INDEX "HelpClaim_targetTaskId_applicantId_key" ON "HelpClaim"("targetTaskId", "applicantId");
CREATE INDEX "HelpClaim_requesterId_status_idx" ON "HelpClaim"("requesterId", "status");
CREATE INDEX "HelpClaim_applicantId_status_idx" ON "HelpClaim"("applicantId", "status");

ALTER TABLE "HelpClaim" ADD CONSTRAINT "HelpClaim_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "MutualAidTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HelpClaim" ADD CONSTRAINT "HelpClaim_offeredTaskId_fkey" FOREIGN KEY ("offeredTaskId") REFERENCES "MutualAidTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HelpClaim" ADD CONSTRAINT "HelpClaim_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HelpSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DMThread and DMMessage were created by
-- 20260627132915_add_dm_models_and_trust_level. This migration only adds the
-- sender index and relation that were missing from that original definition.
CREATE INDEX "DMMessage_senderId_idx" ON "DMMessage"("senderId");
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
