-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DCRCategory" ADD VALUE 'EARLY_START';
ALTER TYPE "DCRCategory" ADD VALUE 'NO_WEEKENDS';
ALTER TYPE "DCRCategory" ADD VALUE 'EXTERNAL_TRAINING';
