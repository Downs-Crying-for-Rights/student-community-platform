-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'OPEN', 'CLAIMED', 'IN_PROGRESS', 'EVIDENCE_PENDING', 'COMPLETED', 'REJECTED', 'CLOSED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "EvidenceItemType" AS ENUM ('EVIDENCE_ITEM', 'NOTE', 'OUTCOME', 'FOLLOW_UP');

-- CreateTable
CREATE TABLE "MutualAidTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DCRCategory" NOT NULL,
    "summary" TEXT NOT NULL,
    "expectedHelpType" TEXT NOT NULL,
    "urgencyLevel" "UrgencyLevel" NOT NULL DEFAULT 'MEDIUM',
    "structuredFields" JSONB NOT NULL,
    "attachments" TEXT[],
    "riskFlags" JSONB,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "closureReason" TEXT,
    "completionReport" JSONB,
    "requesterConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "helperConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requesterId" TEXT NOT NULL,

    CONSTRAINT "MutualAidTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTimelineEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "operatorId" TEXT,

    CONSTRAINT "TaskTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "taskId" TEXT NOT NULL,
    "helperId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,

    CONSTRAINT "HelpSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpChat" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "HelpChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpChatMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "quotedMessageId" TEXT,
    "isSystemMessage" BOOLEAN NOT NULL DEFAULT false,
    "isEvidence" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,

    CONSTRAINT "HelpChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRoom" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "EvidenceRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL,
    "type" "EvidenceItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT NOT NULL,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MutualAidTask_status_idx" ON "MutualAidTask"("status");

-- CreateIndex
CREATE INDEX "MutualAidTask_requesterId_idx" ON "MutualAidTask"("requesterId");

-- CreateIndex
CREATE INDEX "MutualAidTask_urgencyLevel_idx" ON "MutualAidTask"("urgencyLevel");

-- CreateIndex
CREATE INDEX "MutualAidTask_createdAt_idx" ON "MutualAidTask"("createdAt");

-- CreateIndex
CREATE INDEX "TaskTimelineEvent_taskId_idx" ON "TaskTimelineEvent"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpSession_taskId_key" ON "HelpSession"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpChat_sessionId_key" ON "HelpChat"("sessionId");

-- CreateIndex
CREATE INDEX "HelpChatMessage_chatId_createdAt_idx" ON "HelpChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRoom_sessionId_key" ON "EvidenceRoom"("sessionId");

-- CreateIndex
CREATE INDEX "EvidenceItem_roomId_type_idx" ON "EvidenceItem"("roomId", "type");

-- CreateIndex
CREATE INDEX "ModerationAction_targetType_targetId_idx" ON "ModerationAction"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ModerationAction_operatorId_idx" ON "ModerationAction"("operatorId");

-- CreateIndex
CREATE INDEX "ModerationAction_createdAt_idx" ON "ModerationAction"("createdAt");

-- AddForeignKey
ALTER TABLE "MutualAidTask" ADD CONSTRAINT "MutualAidTask_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTimelineEvent" ADD CONSTRAINT "TaskTimelineEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MutualAidTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpSession" ADD CONSTRAINT "HelpSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MutualAidTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpChat" ADD CONSTRAINT "HelpChat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HelpSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpChatMessage" ADD CONSTRAINT "HelpChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "HelpChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRoom" ADD CONSTRAINT "EvidenceRoom_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HelpSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "EvidenceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
