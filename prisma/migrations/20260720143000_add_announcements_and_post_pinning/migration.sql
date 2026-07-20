ALTER TABLE "Post"
ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pinnedAt" TIMESTAMP(3);

ALTER TABLE "DMThread"
ADD COLUMN "isSystemReadOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "forcePopup" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementReceipt" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementDelivery" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "threadId" TEXT,
    "messageId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "AnnouncementDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Post_status_isPinned_pinnedAt_createdAt_idx" ON "Post"("status", "isPinned", "pinnedAt", "createdAt");
CREATE INDEX "Post_boardId_status_isPinned_pinnedAt_createdAt_idx" ON "Post"("boardId", "status", "isPinned", "pinnedAt", "createdAt");
CREATE INDEX "Announcement_isPublished_forcePopup_publishedAt_idx" ON "Announcement"("isPublished", "forcePopup", "publishedAt");
CREATE INDEX "AnnouncementReceipt_userId_dismissedAt_idx" ON "AnnouncementReceipt"("userId", "dismissedAt");
CREATE UNIQUE INDEX "AnnouncementReceipt_announcementId_revision_userId_key" ON "AnnouncementReceipt"("announcementId", "revision", "userId");
CREATE UNIQUE INDEX "AnnouncementDelivery_messageId_key" ON "AnnouncementDelivery"("messageId");
CREATE INDEX "AnnouncementDelivery_announcementId_status_idx" ON "AnnouncementDelivery"("announcementId", "status");
CREATE INDEX "AnnouncementDelivery_userId_deliveredAt_idx" ON "AnnouncementDelivery"("userId", "deliveredAt");
CREATE UNIQUE INDEX "AnnouncementDelivery_announcementId_userId_key" ON "AnnouncementDelivery"("announcementId", "userId");

ALTER TABLE "AnnouncementReceipt" ADD CONSTRAINT "AnnouncementReceipt_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementReceipt" ADD CONSTRAINT "AnnouncementReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementDelivery" ADD CONSTRAINT "AnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementDelivery" ADD CONSTRAINT "AnnouncementDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
