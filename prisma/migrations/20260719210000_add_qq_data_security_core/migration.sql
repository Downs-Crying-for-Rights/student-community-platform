CREATE TYPE "QQGrantPurpose" AS ENUM ('IDENTITY_BIND', 'DELEGATION_SUBMIT', 'CASE_REVIEW', 'TASK_PUBLISH');
CREATE TYPE "QQConversationState" AS ENUM ('IDLE', 'DELEGATION_FORM', 'DRAFT_READY');
CREATE TYPE "QQOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'RETRY', 'FAILED');

CREATE TABLE "QQIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lookupHash" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QQIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QQDelegationDraft" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "QQDelegationDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QQGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "QQGrantPurpose" NOT NULL,
    "userId" TEXT,
    "draftId" TEXT,
    "targetId" TEXT,
    "identityLookupHash" TEXT,
    "identityCiphertext" TEXT,
    "identityIv" TEXT,
    "identityAuthTag" TEXT,
    "identityKeyVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "QQGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QQConversation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "state" "QQConversationState" NOT NULL DEFAULT 'IDLE',
    "step" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QQConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QQBotEventInbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "selfId" TEXT NOT NULL,
    "lookupHash" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "QQBotEventInbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QQMessageOutbox" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "QQOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "QQMessageOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QQIdentity_userId_key" ON "QQIdentity"("userId");
CREATE UNIQUE INDEX "QQIdentity_lookupHash_key" ON "QQIdentity"("lookupHash");
CREATE INDEX "QQIdentity_createdAt_idx" ON "QQIdentity"("createdAt");
CREATE INDEX "QQDelegationDraft_ownerId_updatedAt_idx" ON "QQDelegationDraft"("ownerId", "updatedAt");
CREATE INDEX "QQDelegationDraft_expiresAt_idx" ON "QQDelegationDraft"("expiresAt");
CREATE UNIQUE INDEX "QQGrant_tokenHash_key" ON "QQGrant"("tokenHash");
CREATE INDEX "QQGrant_userId_purpose_createdAt_idx" ON "QQGrant"("userId", "purpose", "createdAt");
CREATE INDEX "QQGrant_draftId_idx" ON "QQGrant"("draftId");
CREATE INDEX "QQGrant_expiresAt_idx" ON "QQGrant"("expiresAt");
CREATE UNIQUE INDEX "QQConversation_ownerId_key" ON "QQConversation"("ownerId");
CREATE INDEX "QQConversation_state_expiresAt_idx" ON "QQConversation"("state", "expiresAt");
CREATE UNIQUE INDEX "QQBotEventInbox_eventId_key" ON "QQBotEventInbox"("eventId");
CREATE INDEX "QQBotEventInbox_createdAt_idx" ON "QQBotEventInbox"("createdAt");
CREATE UNIQUE INDEX "QQMessageOutbox_dedupeKey_key" ON "QQMessageOutbox"("dedupeKey");
CREATE INDEX "QQMessageOutbox_status_nextAttemptAt_idx" ON "QQMessageOutbox"("status", "nextAttemptAt");
CREATE INDEX "QQMessageOutbox_identityId_createdAt_idx" ON "QQMessageOutbox"("identityId", "createdAt");

ALTER TABLE "QQIdentity" ADD CONSTRAINT "QQIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QQDelegationDraft" ADD CONSTRAINT "QQDelegationDraft_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QQGrant" ADD CONSTRAINT "QQGrant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QQGrant" ADD CONSTRAINT "QQGrant_draftId_fkey"
FOREIGN KEY ("draftId") REFERENCES "QQDelegationDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QQConversation" ADD CONSTRAINT "QQConversation_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QQMessageOutbox" ADD CONSTRAINT "QQMessageOutbox_identityId_fkey"
FOREIGN KEY ("identityId") REFERENCES "QQIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
