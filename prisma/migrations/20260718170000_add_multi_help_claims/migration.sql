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

CREATE TABLE "DMThread" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "participant1Id" TEXT NOT NULL,
    "participant2Id" TEXT NOT NULL,

    CONSTRAINT "DMThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DMMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,

    CONSTRAINT "DMMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DMThread_participant1Id_participant2Id_key" ON "DMThread"("participant1Id", "participant2Id");
CREATE INDEX "DMThread_participant1Id_updatedAt_idx" ON "DMThread"("participant1Id", "updatedAt");
CREATE INDEX "DMThread_participant2Id_updatedAt_idx" ON "DMThread"("participant2Id", "updatedAt");
CREATE INDEX "DMMessage_threadId_createdAt_idx" ON "DMMessage"("threadId", "createdAt");
CREATE INDEX "DMMessage_senderId_idx" ON "DMMessage"("senderId");

ALTER TABLE "DMThread" ADD CONSTRAINT "DMThread_participant1Id_fkey" FOREIGN KEY ("participant1Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DMThread" ADD CONSTRAINT "DMThread_participant2Id_fkey" FOREIGN KEY ("participant2Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DMThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
