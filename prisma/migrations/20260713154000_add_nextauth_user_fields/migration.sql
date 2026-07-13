-- Add the standard fields required by the NextAuth Prisma adapter.
ALTER TABLE "User"
ADD COLUMN "name" TEXT,
ADD COLUMN "emailVerified" TIMESTAMP(3),
ADD COLUMN "image" TEXT;
