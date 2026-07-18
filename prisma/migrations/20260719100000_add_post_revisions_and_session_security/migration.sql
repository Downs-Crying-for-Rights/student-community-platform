CREATE TYPE "PostRevisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

ALTER TABLE "User" ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PostRevision" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "images" TEXT[],
    "visibility" "PostVisibility" NOT NULL,
    "tagIds" TEXT[],
    "status" "PostRevisionStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "baseUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "postId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    CONSTRAINT "PostRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PostRevision_postId_status_createdAt_idx" ON "PostRevision"("postId", "status", "createdAt");
CREATE INDEX "PostRevision_status_createdAt_idx" ON "PostRevision"("status", "createdAt");
CREATE INDEX "PostRevision_editorId_createdAt_idx" ON "PostRevision"("editorId", "createdAt");

ALTER TABLE "PostRevision" ADD CONSTRAINT "PostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostRevision" ADD CONSTRAINT "PostRevision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PostRevision" ADD CONSTRAINT "PostRevision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
