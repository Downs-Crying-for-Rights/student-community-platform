-- Allow a helper to join a mutual-aid request without exchanging a task of their own.
ALTER TABLE "HelpClaim" ALTER COLUMN "offeredTaskId" DROP NOT NULL;
