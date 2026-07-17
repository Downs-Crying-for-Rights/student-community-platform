-- CreateTable
CREATE TABLE "ChatRoomBan" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imposedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "ChatRoomBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatRoomBan_roomId_revokedAt_expiresAt_idx" ON "ChatRoomBan"("roomId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatRoomBan_userId_idx" ON "ChatRoomBan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoomBan_roomId_userId_key" ON "ChatRoomBan"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "ChatRoomBan" ADD CONSTRAINT "ChatRoomBan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomBan" ADD CONSTRAINT "ChatRoomBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomBan" ADD CONSTRAINT "ChatRoomBan_imposedById_fkey" FOREIGN KEY ("imposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomBan" ADD CONSTRAINT "ChatRoomBan_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
