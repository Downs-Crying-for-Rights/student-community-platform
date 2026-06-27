-- CreateTable
CREATE TABLE "DMThread" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "participant1Id" TEXT NOT NULL,
    "participant2Id" TEXT NOT NULL,

    CONSTRAINT "DMThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,

    CONSTRAINT "DMMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DMThread_participant1Id_updatedAt_idx" ON "DMThread"("participant1Id", "updatedAt");

-- CreateIndex
CREATE INDEX "DMThread_participant2Id_updatedAt_idx" ON "DMThread"("participant2Id", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DMThread_participant1Id_participant2Id_key" ON "DMThread"("participant1Id", "participant2Id");

-- CreateIndex
CREATE INDEX "DMMessage_threadId_createdAt_idx" ON "DMMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "DMThread" ADD CONSTRAINT "DMThread_participant1Id_fkey" FOREIGN KEY ("participant1Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMThread" ADD CONSTRAINT "DMThread_participant2Id_fkey" FOREIGN KEY ("participant2Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DMThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
