CREATE TYPE "IdentityVerificationMethod" AS ENUM ('STUDENT_DOCUMENT', 'ID_HOLDING_PHOTO', 'SCHOOL_UNIFORM', 'REAL_NAME_ID');
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User"
  ADD COLUMN "realVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "studentVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedIdentityHash" TEXT;

CREATE UNIQUE INDEX "User_verifiedIdentityHash_key" ON "User"("verifiedIdentityHash");

CREATE TABLE "IdentityVerificationApplication" (
  "id" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "pendingApplicantId" TEXT,
  "method" "IdentityVerificationMethod" NOT NULL,
  "status" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "evidenceKey" TEXT,
  "evidenceMime" TEXT,
  "evidenceSize" INTEGER,
  "evidenceDeleteAfter" TIMESTAMP(3),
  "identityCiphertext" TEXT,
  "identityIv" TEXT,
  "identityAuthTag" TEXT,
  "identityKeyVersion" INTEGER,
  "identityLookupHash" TEXT,
  "reviewNote" TEXT,
  "reviewerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "IdentityVerificationApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IdentityVerificationApplication_applicantId_createdAt_idx" ON "IdentityVerificationApplication"("applicantId", "createdAt");
CREATE INDEX "IdentityVerificationApplication_status_createdAt_idx" ON "IdentityVerificationApplication"("status", "createdAt");
CREATE INDEX "IdentityVerificationApplication_identityLookupHash_idx" ON "IdentityVerificationApplication"("identityLookupHash");
CREATE INDEX "IdentityVerificationApplication_evidenceDeleteAfter_idx" ON "IdentityVerificationApplication"("evidenceDeleteAfter");
CREATE UNIQUE INDEX "IdentityVerificationApplication_pendingApplicantId_key" ON "IdentityVerificationApplication"("pendingApplicantId");

ALTER TABLE "IdentityVerificationApplication"
  ADD CONSTRAINT "IdentityVerificationApplication_applicantId_fkey"
  FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdentityVerificationApplication"
  ADD CONSTRAINT "IdentityVerificationApplication_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
