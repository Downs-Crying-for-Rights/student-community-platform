-- Link each DCR access application to the exact Case it reviews.
ALTER TABLE "AccessApplication" ADD COLUMN "caseId" TEXT;

-- Only backfill records whose owner, pledge and creation order identify one Case
-- unambiguously. Ambiguous historical records remain NULL for manual repair.
UPDATE "AccessApplication" AS application
SET "caseId" = candidate."id"
FROM "Case" AS candidate
WHERE application."type" = 'DCR'
  AND application."caseId" IS NULL
  AND candidate."submitterId" = application."applicantId"
  AND candidate."pledgeText" = application."pledgeText"
  AND candidate."createdAt" <= application."createdAt"
  AND (
    SELECT COUNT(*)
    FROM "Case" AS matching_case
    WHERE matching_case."submitterId" = application."applicantId"
      AND matching_case."pledgeText" = application."pledgeText"
      AND matching_case."createdAt" <= application."createdAt"
  ) = 1;

CREATE UNIQUE INDEX "AccessApplication_caseId_key"
ON "AccessApplication"("caseId");

CREATE INDEX "AccessApplication_applicantId_type_status_idx"
ON "AccessApplication"("applicantId", "type", "status");

ALTER TABLE "AccessApplication"
ADD CONSTRAINT "AccessApplication_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "Case"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- New DCR applications must be explicitly linked. NOT VALID keeps ambiguous
-- historical rows available for manual repair while enforcing all new writes.
ALTER TABLE "AccessApplication"
ADD CONSTRAINT "AccessApplication_dcr_case_required"
CHECK ("type" <> 'DCR' OR "caseId" IS NOT NULL)
NOT VALID;
