import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ==================== Seed Data Definitions ====================

export const adminUser = {
  email: "admin@student-community.local",
  nickname: "系统管理员",
  role: "ADMIN" as const,
  onboardingDone: true,
  quizPassed: true,
};

export const publicBoards = [
  { name: "娱乐", description: "轻松娱乐、趣味分享", zone: "PUBLIC" as const, sortWeight: 0 },
  { name: "工具使用", description: "实用工具推荐与使用技巧", zone: "PUBLIC" as const, sortWeight: 1 },
  { name: "AI 效率", description: "AI 工具与效率提升", zone: "PUBLIC" as const, sortWeight: 2 },
  { name: "基础编程", description: "编程入门与学习交流", zone: "PUBLIC" as const, sortWeight: 3 },
  { name: "隐私与账号安全科普", description: "隐私保护与账号安全知识", zone: "PUBLIC" as const, sortWeight: 4 },
  { name: "公告", description: "平台公告与通知", zone: "PUBLIC" as const, sortWeight: 5 },
];

export const psychologyBoards = [
  { name: "心理树洞", description: "匿名倾诉、情绪释放", zone: "PSYCHOLOGY" as const, sortWeight: 0 },
  { name: "情绪支持", description: "同伴支持与鼓励", zone: "PSYCHOLOGY" as const, sortWeight: 1 },
];

export const dcrBoards = [
  { name: "权益互助", description: "权益信息互助与交流", zone: "DCR" as const, sortWeight: 0 },
  { name: "合规咨询", description: "合规渠道咨询与指引", zone: "DCR" as const, sortWeight: 1 },
];

export const allBoards = [...publicBoards, ...psychologyBoards, ...dcrBoards];

export const tags = [
  "学习", "生活", "技术", "心理", "安全",
  "AI", "编程", "效率", "隐私", "公告",
  "求助", "分享", "教程", "讨论",
];

export const knowledgeArticles = [
  {
    title: "社区使用指南",
    content: "# 社区使用指南\n\n欢迎来到学生交流社区！本指南将帮助你快速了解平台的核心功能和使用方法。\n\n## 注册与登录\n\n平台支持邮箱魔法链接登录和邀请码注册两种方式。\n\n## 发帖与互动\n\n你可以在公开区的各个板块发布帖子，与其他同学交流讨论。",
    category: "guide",
    visibility: "PUBLIC" as const,
  },
  {
    title: "社区规范与行为准则",
    content: "# 社区规范与行为准则\n\n为维护良好的社区环境，请遵守以下规范：\n\n1. 尊重他人，禁止人身攻击\n2. 禁止发布违法违规内容\n3. 禁止泄露他人个人信息\n4. 禁止发布广告或钓鱼信息\n5. 遵守各区域的特定规则",
    category: "policy",
    visibility: "PUBLIC" as const,
  },
  {
    title: "隐私保护指南",
    content: "# 隐私保护指南\n\n保护个人隐私是每位社区成员的责任。\n\n## 注意事项\n\n- 不要在帖子中透露真实姓名、学校名称等可识别信息\n- 不要分享手机号、身份证号等敏感信息\n- 使用匿名功能时注意不要在内容中暴露身份",
    category: "policy",
    visibility: "PUBLIC" as const,
  },
  {
    title: "举报流程说明",
    content: "# 举报流程说明\n\n如果你发现违规内容或行为，可以通过以下步骤进行举报：\n\n1. 点击内容旁的举报按钮\n2. 选择举报原因\n3. 填写详细说明（可选）\n4. 提交举报\n\n版主将在 24 小时内处理你的举报。",
    category: "guide",
    visibility: "PUBLIC" as const,
  },
  {
    title: "心理区使用说明",
    content: "# 心理区使用说明\n\n心理交流区是一个安全的同伴支持空间。\n\n## 准入要求\n\n需要通过准入申请才能进入心理区。\n\n## 匿名保护\n\n心理区所有发帖和倾诉均为匿名，系统会自动隐藏你的真实身份。\n\n## 重要提示\n\n如需专业帮助，请联系可信成人或拨打心理援助热线。",
    category: "guide",
    visibility: "PUBLIC" as const,
  },
  {
    title: "倾听者守则",
    content: "# 倾听者守则\n\n作为倾听志愿者，请遵守以下守则：\n\n1. 保持耐心和同理心\n2. 不评判、不说教\n3. 保护倾诉者隐私\n4. 发现严重风险时及时上报\n5. 不提供专业医疗建议\n6. 定期参加培训和督导",
    category: "policy",
    visibility: "PUBLIC" as const,
  },
  {
    title: "DCR 区准入说明",
    content: "# DCR 区准入说明\n\nDCR 私密区采用白名单准入机制。\n\n## 准入条件\n\n- 账号年龄满 7 天\n- 无违规记录\n- 信誉等级良好\n- 签署私密区守则声明\n\n## 申请流程\n\n1. 在 DCR 入口页面点击申请按钮\n2. 阅读并签署守则声明\n3. 等待管理员审核",
    category: "guide",
    visibility: "DCR_ONLY" as const,
  },
  {
    title: "工单提交指南",
    content: "# 工单提交指南\n\nDCR 区采用四步向导式工单提交流程：\n\n1. **选择事项类型**：补课、收费、双休或其他\n2. **填写表单**：按模板填写结构化信息\n3. **隐私检查**：系统自动扫描并标记敏感信息\n4. **声明确认**：确认已移除可识别信息\n\n提交后工单将进入审核队列。",
    category: "guide",
    visibility: "DCR_ONLY" as const,
  },
  {
    title: "合规渠道说明",
    content: "# 合规渠道说明\n\n本平台严格遵守合规要求。\n\n## 重要声明\n\n- 平台不组织、不指挥、不实施任何举报或对抗行动\n- 平台不提供法律建议\n- 平台仅提供信息互助渠道\n\n## 合规渠道\n\n如需反映问题，请通过官方合规渠道进行。",
    category: "policy",
    visibility: "DCR_ONLY" as const,
  },
  {
    title: "常见问题解答",
    content: "# 常见问题解答\n\n## Q: 如何修改昵称？\nA: 进入个人设置页面即可修改。\n\n## Q: 如何申请进入心理区？\nA: 在心理区入口页面点击申请按钮。\n\n## Q: 帖子被删除了怎么办？\nA: 如有异议，可通过举报流程申诉。\n\n## Q: 如何成为倾听者？\nA: 需要通过准入审核并签署倾听者守则。",
    category: "faq",
    visibility: "PUBLIC" as const,
  },
];

export const sensitiveWords = {
  PII: ["手机号", "身份证", "家庭住址", "银行卡", "微信号", "QQ号"],
  RISK: ["自杀", "自残", "伤害", "跳楼", "割腕"],
  PHISHING: ["加我微信", "私聊转账", "免费领取", "扫码领红包"],
  PROFANITY: ["脏话1", "脏话2", "脏话3", "脏话4"],
};

export const quizQuestions = [
  {
    question: "在社区中发帖时，以下哪项行为是正确的？",
    options: ["发布他人真实姓名和学校", "使用匿名功能保护隐私", "分享他人手机号码", "发布未经证实的谣言"],
    answer: 1,
  },
  {
    question: "发现违规内容时，你应该怎么做？",
    options: ["忽略不管", "在评论区公开批评", "使用举报功能", "截图发到其他平台"],
    answer: 2,
  },
  {
    question: "心理交流区的主要目的是什么？",
    options: ["提供专业医疗诊断", "同伴倾听与情绪支持", "组织线下活动", "发布学习资料"],
    answer: 1,
  },
  {
    question: "DCR 私密区的核心原则是什么？",
    options: ["组织集体行动", "不组织不指挥不实施，仅提供信息互助", "绕过监管机制", "收集个人信息"],
    answer: 1,
  },
  {
    question: "以下哪项信息不应该在帖子中出现？",
    options: ["学习心得", "工具推荐", "真实姓名和身份证号", "编程技巧"],
    answer: 2,
  },
];

// ==================== Main Seed Function ====================

export async function main() {
  console.log("🌱 开始播种数据...");

  // 1. Create admin user
  const admin = await prisma.user.upsert({
    where: { email: adminUser.email },
    update: {},
    create: adminUser,
  });
  console.log(`✅ 管理员账户已创建: ${admin.email}`);

  // 2. Create boards
  for (const board of allBoards) {
    await prisma.board.upsert({
      where: { id: `seed-board-${board.name}` },
      update: { description: board.description, zone: board.zone, sortWeight: board.sortWeight },
      create: { id: `seed-board-${board.name}`, ...board },
    });
  }
  console.log(`✅ 板块已创建: ${allBoards.length} 个`);

  // 3. Create tags
  for (const tagName of tags) {
    await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
  }
  console.log(`✅ 标签已创建: ${tags.length} 个`);

  // 4. Create knowledge articles
  for (const article of knowledgeArticles) {
    await prisma.knowledgeArticle.upsert({
      where: { id: `seed-article-${article.title}` },
      update: { content: article.content, category: article.category, visibility: article.visibility },
      create: { id: `seed-article-${article.title}`, ...article, isPublished: true },
    });
  }
  console.log(`✅ 知识库文章已创建: ${knowledgeArticles.length} 篇`);

  // 5. Create sensitive words
  const allSensitiveWords = Object.entries(sensitiveWords).flatMap(([category, words]) =>
    words.map((word) => ({ word, category: category as "PII" | "RISK" | "PHISHING" | "PROFANITY" }))
  );
  for (const sw of allSensitiveWords) {
    await prisma.sensitiveWord.upsert({
      where: { word: sw.word },
      update: {},
      create: sw,
    });
  }
  console.log(`✅ 敏感词已创建: ${allSensitiveWords.length} 个`);

  // 6. Create quiz data as a KnowledgeArticle with category "quiz"
  await prisma.knowledgeArticle.upsert({
    where: { id: "seed-article-quiz" },
    update: { content: JSON.stringify(quizQuestions) },
    create: {
      id: "seed-article-quiz",
      title: "新手测验题目",
      content: JSON.stringify(quizQuestions),
      category: "quiz",
      visibility: "PUBLIC",
      isPublished: true,
    },
  });
  console.log(`✅ 新手测验题目已创建: ${quizQuestions.length} 题`);

  console.log("🎉 种子数据播种完成！");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
