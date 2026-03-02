import { z } from "zod";

// ==================== 用户相关 ====================

export const emailSchema = z
  .string()
  .email("请输入有效的邮箱地址")
  .max(255, "邮箱地址不能超过 255 个字符");

export const nicknameSchema = z
  .string()
  .min(2, "昵称至少 2 个字符")
  .max(20, "昵称不能超过 20 个字符")
  .regex(/^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/, "昵称只能包含中文、英文、数字、下划线和连字符");

export const bioSchema = z
  .string()
  .max(200, "个人简介不能超过 200 个字符")
  .optional();

export const avatarUrlSchema = z
  .string()
  .url("请输入有效的头像 URL")
  .optional();

// ==================== 帖子相关 ====================

export const postTitleSchema = z
  .string()
  .min(1, "标题不能为空")
  .max(30, "标题不能超过 30 个字符");

export const postContentSchema = z
  .string()
  .min(1, "内容不能为空")
  .max(10000, "内容不能超过 10000 个字符");

export const postSummarySchema = z
  .string()
  .max(60, "摘要不能超过 60 个字符")
  .optional();

export const postVisibilitySchema = z.enum(["PUBLIC", "MATCHED", "MODS_ONLY"]);

export const dcrCategorySchema = z.enum(["TUTORING", "FEES", "WEEKENDS", "OTHER", "EARLY_START", "NO_WEEKENDS", "EXTERNAL_TRAINING"]);

// ==================== 评论相关 ====================

export const commentContentSchema = z
  .string()
  .min(1, "评论内容不能为空")
  .max(2000, "评论内容不能超过 2000 个字符");

// ==================== 举报相关 ====================

export const reportReasonSchema = z
  .string()
  .min(1, "举报原因不能为空")
  .max(500, "举报原因不能超过 500 个字符");

// ==================== 邀请码相关 ====================

export const inviteCodeSchema = z
  .string()
  .min(6, "邀请码至少 6 个字符")
  .max(32, "邀请码不能超过 32 个字符");

// ==================== 搜索相关 ====================

export const searchQuerySchema = z
  .string()
  .min(1, "搜索关键词不能为空")
  .max(100, "搜索关键词不能超过 100 个字符");

// ==================== 分页相关 ====================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

// ==================== 复合 Schema ====================

export const createPostSchema = z.object({
  title: postTitleSchema,
  content: postContentSchema,
  summary: postSummarySchema,
  boardId: z.string().min(1, "板块 ID 不能为空"),
  tagIds: z.array(z.string().cuid()).max(5, "最多选择 5 个标签").optional(),
  tagNames: z.array(z.string().min(1).max(30)).max(5, "最多 5 个标签").optional(),
  images: z.array(z.string()).max(9, "最多上传 9 张图片").optional(),
  visibility: postVisibilitySchema.optional(),
  dcrCategory: dcrCategorySchema.optional(),
  isAnonymous: z.boolean().optional(),
});

export const updatePostSchema = z.object({
  title: postTitleSchema.optional(),
  content: postContentSchema.optional(),
  summary: postSummarySchema,
  tagIds: z.array(z.string().cuid()).max(5).optional(),
  images: z.array(z.string().url()).max(9).optional(),
  visibility: postVisibilitySchema.optional(),
});

export const updateProfileSchema = z.object({
  nickname: nicknameSchema.optional(),
  avatar: avatarUrlSchema,
  bio: bioSchema,
});

export const createCommentSchema = z.object({
  content: commentContentSchema,
  parentId: z.string().cuid("无效的父评论 ID").optional(),
});

export const createReportSchema = z.object({
  reason: reportReasonSchema,
  details: z.string().max(2000).optional(),
  targetUserId: z.string().cuid().optional(),
  targetPostId: z.string().cuid().optional(),
  targetCommentId: z.string().cuid().optional(),
});

// ==================== 标签相关 ====================

export const tagNameSchema = z
  .string()
  .min(1, "标签名称不能为空")
  .max(30, "标签名称不能超过 30 个字符");

export const createTagSchema = z.object({
  name: tagNameSchema,
});

// ==================== 知识库相关 ====================

export const articleTitleSchema = z
  .string()
  .min(1, "文章标题不能为空")
  .max(200, "文章标题不能超过 200 个字符");

export const articleContentSchema = z
  .string()
  .min(1, "文章内容不能为空")
  .max(50000, "文章内容不能超过 50000 个字符");

export const articleCategorySchema = z
  .string()
  .min(1, "分类不能为空")
  .max(50, "分类不能超过 50 个字符");

export const articleVisibilitySchema = z.enum(["PUBLIC", "DCR_ONLY"]);

export const createArticleSchema = z.object({
  title: articleTitleSchema,
  content: articleContentSchema,
  category: articleCategorySchema,
  visibility: articleVisibilitySchema.default("PUBLIC"),
  isPublished: z.boolean().default(false),
});

export const updateArticleSchema = z.object({
  title: articleTitleSchema.optional(),
  content: articleContentSchema.optional(),
  category: articleCategorySchema.optional(),
  visibility: articleVisibilitySchema.optional(),
  isPublished: z.boolean().optional(),
});

// ==================== 板块相关 ====================

export const boardNameSchema = z
  .string()
  .min(1, "板块名称不能为空")
  .max(50, "板块名称不能超过 50 个字符");

export const boardDescriptionSchema = z
  .string()
  .max(500, "板块描述不能超过 500 个字符")
  .optional();

export const boardZoneSchema = z.enum(["PUBLIC", "PSYCHOLOGY", "DCR"]);

export const createBoardSchema = z.object({
  name: boardNameSchema,
  description: boardDescriptionSchema,
  zone: boardZoneSchema,
  sortWeight: z.number().int().min(0).default(0),
});

export const updateBoardSchema = z.object({
  name: boardNameSchema.optional(),
  description: boardDescriptionSchema,
  sortWeight: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ==================== 认证相关 ====================

export const phoneSchema = z
  .string()
  .regex(/^1\d{10}$/, "请输入有效的中国大陆手机号");

export const verificationCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "验证码为 6 位数字");

export const passwordSchema = z
  .string()
  .min(8, "密码至少 8 个字符")
  .max(72, "密码不能超过 72 个字符");

export const loginPasswordSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "请输入密码"),
});

export const loginSmsSchema = z.object({
  phone: phoneSchema,
  code: verificationCodeSchema,
});

export const sendCodeSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(["login", "bindphone"]),
});

export const bindPhoneSchema = z.object({
  phone: phoneSchema,
  code: verificationCodeSchema,
});

export const setPasswordSchema = z.object({
  password: passwordSchema,
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema,
  code: verificationCodeSchema,
});

export const inviteRegisterSchema = z.object({
  inviteCode: inviteCodeSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema,
  code: verificationCodeSchema,
});

// ==================== DCR 委托表相关 ====================

export const delegationFormSchema = z.object({
  contentType: z.enum(['学校补课类', '学校提前开学类', '学校不双休类', '校外培训机构类', '其他']),
  schoolName: z.string().min(1, '学校名称不能为空').max(100),
  schoolCategory: z.enum(['公立学历制学校', '私立学历制学校', '校外培训机构']),
  schoolType: z.string().min(1, '请选择学校类型'),
  schoolAddress: z.string().min(1, '学校地址不能为空').max(200),
  reportChannels: z.string().max(500).optional(),
  description: z.string().min(20, '详细描述至少 20 字').max(5000),
  feeStatus: z.enum(['none', 'charged', 'unknown']),
  feeDetails: z.string().max(500).optional(),
  demands: z.array(z.string()).min(1, '请至少选择一项诉求'),
  otherDemand: z.string().max(500).optional(),
  confirmations: z.tuple([z.literal(true), z.literal(true), z.literal(true)]),
});

export const quizAnswerSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    selectedKey: z.string(),
  })).length(5),
});

// ==================== 互助任务 Schemas ====================

export const urgencyLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const evidenceItemTypeSchema = z.enum(['EVIDENCE_ITEM', 'NOTE', 'OUTCOME', 'FOLLOW_UP']);

export const createTaskSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100),
  category: dcrCategorySchema,
  summary: z.string().min(10, '摘要至少 10 字').max(2000),
  expectedHelpType: z.string().min(1).max(200),
  urgencyLevel: urgencyLevelSchema.default('MEDIUM'),
  structuredFields: z.object({
    dateRange: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
    locationGranularity: z.enum(['CITY', 'DISTRICT']).optional(),
    helpCategory: z.enum(['POLICY_CONSULT', 'COMMUNICATION_TEMPLATE', 'MATERIAL_PREP', 'OTHER']).optional(),
  }).default({}),
});

export const taskActionSchema = z.object({
  action: z.enum(['submit', 'review', 'approve', 'reject']),
  reason: z.string().max(1000).optional(),
});

export const sendChatMessageSchema = z.object({
  content: z.string().min(1, '消息不能为空').max(5000),
  quotedMessageId: z.string().cuid().optional(),
  fileUrl: z.string().url().optional(),
});

export const createEvidenceItemSchema = z.object({
  type: evidenceItemTypeSchema,
  description: z.string().min(1, '描述不能为空').max(5000),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  sensitiveConfirmed: z.literal(true, { errorMap: () => ({ message: '请确认敏感信息声明' }) }),
});

export const closeTaskSchema = z.object({
  action: z.enum(['request', 'confirm', 'force']),
  reason: z.string().max(1000).optional(),
});

export const disputeTaskSchema = z.object({
  explanation: z.string().min(10, '争议说明至少 10 字').max(5000),
});

export const moderateDisputeSchema = z.object({
  action: z.enum(['takedown', 'replace_helper', 'ban_user', 'dismiss', 'freeze']),
  reason: z.string().min(1).max(1000),
  targetUserId: z.string().cuid().optional(),
});
