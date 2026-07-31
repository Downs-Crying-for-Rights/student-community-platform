-- Allow a site account to bind the QQ Open Platform openid independently
-- from its personal OneBot QQ number.
CREATE TABLE "QQOfficialIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lookupHash" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QQOfficialIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "QQIdentityProvider" AS ENUM ('ONEBOT11', 'QQ_OFFICIAL');

ALTER TABLE "QQGrant"
ADD COLUMN "identityProvider" "QQIdentityProvider" NOT NULL DEFAULT 'ONEBOT11';

CREATE UNIQUE INDEX "QQOfficialIdentity_userId_key" ON "QQOfficialIdentity"("userId");
CREATE UNIQUE INDEX "QQOfficialIdentity_lookupHash_key" ON "QQOfficialIdentity"("lookupHash");
CREATE INDEX "QQOfficialIdentity_createdAt_idx" ON "QQOfficialIdentity"("createdAt");

ALTER TABLE "QQOfficialIdentity"
ADD CONSTRAINT "QQOfficialIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
