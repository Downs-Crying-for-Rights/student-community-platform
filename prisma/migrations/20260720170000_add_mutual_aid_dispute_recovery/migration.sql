ALTER TYPE "CycleStatus" ADD VALUE 'CLOSED';
ALTER TYPE "LinkStatus" ADD VALUE 'CLOSED';

ALTER TABLE "MutualAidLink"
ADD COLUMN "statusBeforeDispute" "LinkStatus";
