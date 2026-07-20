import prisma from "@/lib/prisma";

export const COMMUNITY_GUIDELINES_KEY = "community_guidelines";

export const DEFAULT_COMMUNITY_GUIDELINES = `# 社区规范

## 一、行为准则

1. 尊重他人：不得发布侮辱、歧视、骚扰他人的内容。
2. 真实表达：鼓励真实、理性的交流，不传播未经证实的信息。
3. 保护隐私：不得泄露他人个人信息，包括但不限于姓名、联系方式、照片等。
4. 友善互助：营造积极、友善的社区氛围，互相帮助。

## 二、禁止行为

1. 发布违法违规内容，包括但不限于暴力、色情、赌博等。
2. 发布钓鱼内容，诱导他人提供个人信息或进行线下接触。
3. 恶意刷屏、灌水或发布垃圾信息。
4. 冒充他人身份或冒充平台官方。
5. 组织、指挥或实施任何形式的举报或对抗行动。
6. 发布包含真实姓名、学校名称、教师姓名等可识别信息的内容。

## 三、处罚规则

1. 首次违规：系统警告并删除违规内容。
2. 二次违规：限制发帖频率（每日 1 篇），持续 7 天。
3. 三次违规：账户封禁 30 天。
4. 严重违规：永久封禁账户。
5. 平台可根据违规严重程度直接采取更严厉的处罚措施。`;

export async function getCommunityGuidelines() {
  return prisma.siteContent.upsert({
    where: { key: COMMUNITY_GUIDELINES_KEY },
    update: {},
    create: {
      key: COMMUNITY_GUIDELINES_KEY,
      title: "社区规范",
      content: DEFAULT_COMMUNITY_GUIDELINES,
    },
    select: { title: true, content: true },
  });
}
