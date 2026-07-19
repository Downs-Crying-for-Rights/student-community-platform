import prisma from "@/lib/prisma";

export const DM_CONSENT_KEY = "dm_consent";
export const DEFAULT_DM_CONSENT_TITLE = "私信巡查授权提示";
export const DEFAULT_DM_CONSENT_CONTENT =
  "依据《中华人民共和国网络安全法》《互联网论坛社区服务管理规定》，本平台负有对用户发布信息进行监管的义务，平台将会巡查用户私信。\n\n点击“同意”即表示您授权平台查看您的私信。如不同意，将无法使用私信功能。";

export async function getDMConsentDocument() {
  return prisma.siteContent.upsert({
    where: { key: DM_CONSENT_KEY },
    update: {},
    create: {
      key: DM_CONSENT_KEY,
      title: DEFAULT_DM_CONSENT_TITLE,
      content: DEFAULT_DM_CONSENT_CONTENT,
    },
  });
}

export async function getDMConsentStatus(userId: string) {
  const [document, user] = await Promise.all([
    getDMConsentDocument(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { dmConsentVersion: true, dmConsentAcceptedAt: true },
    }),
  ]);
  return {
    title: document.title,
    content: document.content,
    version: document.revision,
    accepted: user?.dmConsentVersion === document.revision,
    acceptedAt: user?.dmConsentAcceptedAt?.toISOString() ?? null,
  };
}

export async function requireDMConsent(userId: string) {
  const status = await getDMConsentStatus(userId);
  return status.accepted ? null : status;
}
