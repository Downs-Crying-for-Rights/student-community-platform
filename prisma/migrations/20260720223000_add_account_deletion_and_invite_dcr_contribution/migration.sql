CREATE TYPE "AccountDeletionRequestStatus" AS ENUM ('PENDING', 'REJECTED', 'CANCELLED', 'COMPLETED');

ALTER TABLE "User"
ADD COLUMN "dcrContributionAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deactivatedAt" TIMESTAMP(3);

ALTER TABLE "InviteCode"
ADD COLUMN "dcrContributionAccess" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "status" "AccountDeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "reviewerId" TEXT,
    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionRequest_userId_key" ON "AccountDeletionRequest"("userId");
CREATE INDEX "AccountDeletionRequest_status_requestedAt_idx" ON "AccountDeletionRequest"("status", "requestedAt");
CREATE INDEX "AccountDeletionRequest_reviewerId_reviewedAt_idx" ON "AccountDeletionRequest"("reviewerId", "reviewedAt");

ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
