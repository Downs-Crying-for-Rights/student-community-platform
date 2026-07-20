ALTER TABLE "User"
ADD COLUMN "profileCompletionRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "qqNumber" TEXT;

CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "smsVerificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);
