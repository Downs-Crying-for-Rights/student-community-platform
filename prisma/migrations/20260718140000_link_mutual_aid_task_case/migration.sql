-- Link a published mutual-aid task to the delegation form that was approved
-- during DCR admission. Existing tasks remain valid without a source case.
ALTER TABLE "MutualAidTask" ADD COLUMN "caseId" TEXT;

CREATE INDEX "MutualAidTask_caseId_idx" ON "MutualAidTask"("caseId");

ALTER TABLE "MutualAidTask"
ADD CONSTRAINT "MutualAidTask_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "Case"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
