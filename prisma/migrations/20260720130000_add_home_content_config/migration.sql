ALTER TABLE "SystemConfig"
ADD COLUMN "homeHeroTitle" TEXT NOT NULL DEFAULT '电子扫盲 · 学习交流',
ADD COLUMN "homeHeroDescription" TEXT NOT NULL DEFAULT '学生交流社区 — 从认知开始，拒绝信息差。浏览电子扫盲知识、学术讨论与娱乐分享。',
ADD COLUMN "homeHeroLinks" JSONB;

INSERT INTO "SiteContent" ("id", "key", "title", "content", "revision", "updatedAt")
VALUES (
  'system-community-guidelines',
  'community_guidelines',
  '社区规范',
  E'# 社区规范\n\n## 一、行为准则\n\n1. 尊重他人：不得发布侮辱、歧视、骚扰他人的内容。\n2. 真实表达：鼓励真实、理性的交流，不传播未经证实的信息。\n3. 保护隐私：不得泄露他人个人信息，包括但不限于姓名、联系方式、照片等。\n4. 友善互助：营造积极、友善的社区氛围，互相帮助。\n\n## 二、禁止行为\n\n1. 发布违法违规内容，包括但不限于暴力、色情、赌博等。\n2. 发布钓鱼内容，诱导他人提供个人信息或进行线下接触。\n3. 恶意刷屏、灌水或发布垃圾信息。\n4. 冒充他人身份或冒充平台官方。\n5. 组织、指挥或实施任何形式的举报或对抗行动。\n6. 发布包含真实姓名、学校名称、教师姓名等可识别信息的内容。\n\n## 三、处罚规则\n\n1. 首次违规：系统警告并删除违规内容。\n2. 二次违规：限制发帖频率（每日 1 篇），持续 7 天。\n3. 三次违规：账户封禁 30 天。\n4. 严重违规：永久封禁账户。\n5. 平台可根据违规严重程度直接采取更严厉的处罚措施。',
  1,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
