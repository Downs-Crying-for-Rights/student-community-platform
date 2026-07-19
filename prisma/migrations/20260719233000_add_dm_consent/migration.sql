ALTER TABLE "User"
ADD COLUMN "dmConsentVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dmConsentAcceptedAt" TIMESTAMP(3);

ALTER TABLE "SiteContent"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

INSERT INTO "SiteContent" ("id", "key", "title", "content", "revision", "updatedAt")
VALUES (
  'dm-consent-default',
  'dm_consent',
  '私信巡查授权提示',
  '依据《中华人民共和国网络安全法》《互联网论坛社区服务管理规定》，本平台负有对用户发布信息进行监管的义务，平台将会巡查用户私信。

点击“同意”即表示您授权平台查看您的私信。如不同意，将无法使用私信功能。',
  1,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

UPDATE "SiteContent"
SET "content" = replace("content", E'\\n', chr(10))
WHERE "key" = 'dm_consent';
