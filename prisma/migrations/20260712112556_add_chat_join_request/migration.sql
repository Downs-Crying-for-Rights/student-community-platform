-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN     "joinMode" TEXT NOT NULL DEFAULT 'DIRECT';

-- CreateTable
CREATE TABLE "ChatRoomJoinRequest" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoomJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatRoomJoinRequest_roomId_status_idx" ON "ChatRoomJoinRequest"("roomId", "status");

-- CreateIndex
CREATE INDEX "ChatRoomJoinRequest_userId_idx" ON "ChatRoomJoinRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoomJoinRequest_roomId_userId_key" ON "ChatRoomJoinRequest"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "ChatRoomJoinRequest" ADD CONSTRAINT "ChatRoomJoinRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
