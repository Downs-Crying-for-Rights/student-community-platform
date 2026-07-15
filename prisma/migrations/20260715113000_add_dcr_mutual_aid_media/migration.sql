-- DCR 互助参与者可独立获得 Helper 工作台权限，不再强制改写全局角色。
ALTER TABLE "User"
ADD COLUMN "dcrHelperAccess" BOOLEAN NOT NULL DEFAULT false;

-- 工单消息支持文字、图片、录音和普通附件。
CREATE TYPE "CaseMessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'FILE');

ALTER TABLE "Message"
ADD COLUMN "messageType" "CaseMessageType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN "mediaUrl" TEXT,
ADD COLUMN "mediaName" TEXT,
ADD COLUMN "mediaMimeType" TEXT,
ADD COLUMN "mediaSize" INTEGER,
ADD COLUMN "durationSeconds" INTEGER;

-- 互助循环可选择双方闭环 A->B->A 或三方闭环 A->B->C->A。
CREATE TYPE "CycleMode" AS ENUM ('TWO_PARTY', 'THREE_PARTY');

ALTER TABLE "MutualAidCycle"
ADD COLUMN "mode" "CycleMode" NOT NULL DEFAULT 'THREE_PARTY';

-- 为已经真实参与互助的用户回填 Helper 工作台权限。
UPDATE "User" u
SET "dcrHelperAccess" = true
WHERE EXISTS (
  SELECT 1 FROM "HelpSession" hs
  WHERE hs."helperId" = u.id OR hs."requesterId" = u.id
)
OR EXISTS (
  SELECT 1 FROM "MutualAidLink" ml
  WHERE ml."fromUserId" = u.id OR ml."toUserId" = u.id
);
