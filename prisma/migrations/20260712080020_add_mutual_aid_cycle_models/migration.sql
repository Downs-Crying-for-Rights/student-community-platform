-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('INITIATING', 'ACTIVE', 'COMPLETED', 'BROKEN');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PENDING_REQUEST', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED');

-- CreateTable
CREATE TABLE "MutualAidCycle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'INITIATING',
    "initiatorId" TEXT NOT NULL,

    CONSTRAINT "MutualAidCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutualAidLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'PENDING_REQUEST',
    "description" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "breakReason" TEXT,

    CONSTRAINT "MutualAidLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MutualAidCycle_initiatorId_status_idx" ON "MutualAidCycle"("initiatorId", "status");

-- CreateIndex
CREATE INDEX "MutualAidCycle_status_createdAt_idx" ON "MutualAidCycle"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MutualAidLink_cycleId_fromUserId_idx" ON "MutualAidLink"("cycleId", "fromUserId");

-- CreateIndex
CREATE INDEX "MutualAidLink_cycleId_toUserId_idx" ON "MutualAidLink"("cycleId", "toUserId");

-- CreateIndex
CREATE INDEX "MutualAidLink_fromUserId_status_idx" ON "MutualAidLink"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "MutualAidLink_toUserId_status_idx" ON "MutualAidLink"("toUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MutualAidLink_cycleId_direction_key" ON "MutualAidLink"("cycleId", "direction");

-- AddForeignKey
ALTER TABLE "MutualAidCycle" ADD CONSTRAINT "MutualAidCycle_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutualAidLink" ADD CONSTRAINT "MutualAidLink_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MutualAidCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutualAidLink" ADD CONSTRAINT "MutualAidLink_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutualAidLink" ADD CONSTRAINT "MutualAidLink_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
