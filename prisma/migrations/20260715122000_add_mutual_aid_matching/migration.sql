CREATE TYPE "CycleMatchStatus" AS ENUM ('WAITING', 'MATCHING', 'MATCHED', 'CANCELLED');

CREATE TABLE "MutualAidMatchRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "CycleMatchStatus" NOT NULL DEFAULT 'WAITING',
    "userId" TEXT NOT NULL,
    "needText" TEXT,
    "offerText" TEXT,
    "matchedCycleId" TEXT,
    CONSTRAINT "MutualAidMatchRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MutualAidMatchRequest_userId_key" ON "MutualAidMatchRequest"("userId");
CREATE INDEX "MutualAidMatchRequest_status_createdAt_idx" ON "MutualAidMatchRequest"("status", "createdAt");
CREATE INDEX "MutualAidMatchRequest_matchedCycleId_idx" ON "MutualAidMatchRequest"("matchedCycleId");
ALTER TABLE "MutualAidMatchRequest" ADD CONSTRAINT "MutualAidMatchRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualAidMatchRequest" ADD CONSTRAINT "MutualAidMatchRequest_matchedCycleId_fkey" FOREIGN KEY ("matchedCycleId") REFERENCES "MutualAidCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
