ALTER TYPE "IdentityVerificationStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE "UserPunishmentType" ADD VALUE IF NOT EXISTS 'WARNING';
ALTER TYPE "UserPunishmentType" ADD VALUE IF NOT EXISTS 'TEMPORARY_MUTE';
ALTER TYPE "UserPunishmentType" ADD VALUE IF NOT EXISTS 'PERMANENT_MUTE';
ALTER TYPE "UserPunishmentType" ADD VALUE IF NOT EXISTS 'TEMPORARY_BAN';
ALTER TYPE "UserPunishmentType" ADD VALUE IF NOT EXISTS 'PERMANENT_BAN';

CREATE TYPE "IdentityRevocationScope" AS ENUM ('STUDENT', 'ALL');
CREATE TYPE "IdentityRevocationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "SupportTicketKind" AS ENUM ('GENERAL', 'PUNISHMENT_APPEAL');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportTicketAuthorType" AS ENUM ('USER', 'STAFF', 'SYSTEM');

ALTER TABLE "User" ADD COLUMN "banUntil" TIMESTAMP(3), ADD COLUMN "isMuted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "muteUntil" TIMESTAMP(3);
ALTER TABLE "IdentityVerificationApplication" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "UserPunishment" ADD COLUMN "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "expiresAt" TIMESTAMP(3), ADD COLUMN "acknowledgedAt" TIMESTAMP(3), ADD COLUMN "revokedAt" TIMESTAMP(3), ADD COLUMN "revokeReason" TEXT, ADD COLUMN "revokedById" TEXT;

CREATE TABLE "IdentityVerificationRevocationRequest" (
  "id" TEXT NOT NULL, "scope" "IdentityRevocationScope" NOT NULL, "status" "IdentityRevocationStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL, "reviewNote" TEXT, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  "userId" TEXT NOT NULL, "reviewerId" TEXT, CONSTRAINT "IdentityVerificationRevocationRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL, "kind" "SupportTicketKind" NOT NULL DEFAULT 'GENERAL', "subject" TEXT NOT NULL, "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3), "requesterId" TEXT NOT NULL, "assignedToId" TEXT, "punishmentId" TEXT,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupportTicketMessage" (
  "id" TEXT NOT NULL, "content" TEXT NOT NULL, "authorType" "SupportTicketAuthorType" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ticketId" TEXT NOT NULL, "authorId" TEXT, CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IdentityVerificationRevocationRequest_userId_requestedAt_idx" ON "IdentityVerificationRevocationRequest"("userId", "requestedAt");
CREATE INDEX "IdentityVerificationRevocationRequest_status_requestedAt_idx" ON "IdentityVerificationRevocationRequest"("status", "requestedAt");
CREATE INDEX "UserPunishment_userId_revokedAt_expiresAt_idx" ON "UserPunishment"("userId", "revokedAt", "expiresAt");
CREATE INDEX "SupportTicket_requesterId_updatedAt_idx" ON "SupportTicket"("requesterId", "updatedAt");
CREATE INDEX "SupportTicket_assignedToId_status_updatedAt_idx" ON "SupportTicket"("assignedToId", "status", "updatedAt");
CREATE INDEX "SupportTicket_kind_status_updatedAt_idx" ON "SupportTicket"("kind", "status", "updatedAt");
CREATE INDEX "SupportTicket_punishmentId_idx" ON "SupportTicket"("punishmentId");
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

ALTER TABLE "IdentityVerificationRevocationRequest" ADD CONSTRAINT "IdentityVerificationRevocationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdentityVerificationRevocationRequest" ADD CONSTRAINT "IdentityVerificationRevocationRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPunishment" ADD CONSTRAINT "UserPunishment_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_punishmentId_fkey" FOREIGN KEY ("punishmentId") REFERENCES "UserPunishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SupportTicket_open_punishment_appeal_key" ON "SupportTicket"("punishmentId") WHERE "kind" = 'PUNISHMENT_APPEAL' AND "status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER');
