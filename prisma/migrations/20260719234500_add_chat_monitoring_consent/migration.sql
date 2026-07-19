INSERT INTO "SiteContent" ("id", "key", "title", "content", "revision", "updatedAt")
VALUES (
  'chat-monitoring-consent-default',
  'chat_monitoring_consent',
  '群聊内容巡查须知',
  '依据《中华人民共和国网络安全法》《互联网论坛社区服务管理规定》，本平台负有对用户发布信息进行监管的义务，平台将会巡查群聊内容。创建群聊即代表你同意平台巡查群聊内容。',
  1,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
