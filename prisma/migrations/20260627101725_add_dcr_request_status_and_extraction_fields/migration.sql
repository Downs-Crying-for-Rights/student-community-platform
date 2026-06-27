-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'NEED_MORE_INFO', 'APPROVED', 'REJECTED', 'MANUAL_REVIEW');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "city" TEXT,
ADD COLUMN     "evidenceChecklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "expectedHelperProvince" TEXT,
ADD COLUMN     "extractedFields" JSONB,
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "province" TEXT,
ADD COLUMN     "requestStatus" "RequestStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "riskPreference" TEXT,
ADD COLUMN     "sensitiveHitCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timeRange" TEXT;
