ALTER TABLE "User"
ADD COLUMN "allowDirectMessages" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ChatRoom"
ADD COLUMN "roomNumber" TEXT;

WITH numbered_rooms AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") + 10000000 AS number
  FROM "ChatRoom"
)
UPDATE "ChatRoom" AS room
SET "roomNumber" = numbered_rooms.number::TEXT
FROM numbered_rooms
WHERE room."id" = numbered_rooms."id";

ALTER TABLE "ChatRoom"
ALTER COLUMN "roomNumber" SET NOT NULL;

CREATE UNIQUE INDEX "ChatRoom_roomNumber_key" ON "ChatRoom"("roomNumber");
