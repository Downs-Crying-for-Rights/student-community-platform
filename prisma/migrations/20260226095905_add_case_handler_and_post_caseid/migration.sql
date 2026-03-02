-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "caseId" TEXT;

-- CreateTable
CREATE TABLE "CaseHandler" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseHandler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseHandler_caseId_userId_key" ON "CaseHandler"("caseId", "userId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandler" ADD CONSTRAINT "CaseHandler_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandler" ADD CONSTRAINT "CaseHandler_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
