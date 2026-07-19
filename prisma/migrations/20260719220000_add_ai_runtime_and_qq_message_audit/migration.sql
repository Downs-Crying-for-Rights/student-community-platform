ALTER TABLE "QQBotEventInbox"
ADD COLUMN "inputCiphertext" TEXT,
ADD COLUMN "inputIv" TEXT,
ADD COLUMN "inputAuthTag" TEXT,
ADD COLUMN "inputKeyVersion" INTEGER,
ADD COLUMN "replyCiphertext" TEXT,
ADD COLUMN "replyIv" TEXT,
ADD COLUMN "replyAuthTag" TEXT,
ADD COLUMN "replyKeyVersion" INTEGER;

CREATE TABLE "AiRuntimeConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT NOT NULL,
    "defaultModel" TEXT NOT NULL,
    "complexModel" TEXT NOT NULL,
    "timeoutMs" INTEGER NOT NULL DEFAULT 25000,
    "maxInputChars" INTEGER NOT NULL DEFAULT 12000,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 1800,
    "reviewBasePrompt" TEXT NOT NULL,
    "targetInstructions" JSONB NOT NULL,
    "qqDraftPrompt" TEXT NOT NULL,
    "apiKeyCiphertext" TEXT,
    "apiKeyIv" TEXT,
    "apiKeyAuthTag" TEXT,
    "apiKeyKeyVersion" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "AiRuntimeConfig_pkey" PRIMARY KEY ("id")
);

-- Historical immediate replies can contain bearer-equivalent H5 grants.
UPDATE "QQBotEventInbox"
SET "response" = regexp_replace("response"::text, 'qqg_[A-Za-z0-9_-]+', '[REDACTED_GRANT]', 'g')::jsonb
WHERE "response"::text ~ 'qqg_[A-Za-z0-9_-]+';
