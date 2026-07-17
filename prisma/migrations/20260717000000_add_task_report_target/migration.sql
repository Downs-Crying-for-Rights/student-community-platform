-- AlterTable
ALTER TABLE "Report" ADD COLUMN "targetTaskId" TEXT;

-- CreateIndex
CREATE INDEX "Report_targetTaskId_idx" ON "Report"("targetTaskId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "MutualAidTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
