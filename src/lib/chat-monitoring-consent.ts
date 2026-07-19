import prisma from "@/lib/prisma";

export const CHAT_MONITORING_CONSENT_KEY = "chat_monitoring_consent";
export const DEFAULT_CHAT_MONITORING_CONSENT_TITLE = "群聊内容巡查须知";
export const DEFAULT_CHAT_MONITORING_CONSENT_CONTENT =
  "依据《中华人民共和国网络安全法》《互联网论坛社区服务管理规定》，本平台负有对用户发布信息进行监管的义务，平台将会巡查群聊内容。创建群聊即代表你同意平台巡查群聊内容。";

export async function getChatMonitoringConsent() {
  return prisma.siteContent.upsert({
    where: { key: CHAT_MONITORING_CONSENT_KEY },
    update: {},
    create: {
      key: CHAT_MONITORING_CONSENT_KEY,
      title: DEFAULT_CHAT_MONITORING_CONSENT_TITLE,
      content: DEFAULT_CHAT_MONITORING_CONSENT_CONTENT,
    },
  });
}
