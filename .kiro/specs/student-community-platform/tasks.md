# 实施计划：学生交流社区平台

## 概述

基于 Next.js 14/15 App Router + TypeScript + Tailwind CSS + shadcn/ui + PostgreSQL + Prisma + Redis + NextAuth 构建学生交流社区平台。按增量开发顺序组织任务，每个阶段在前一阶段基础上构建，确保无孤立代码。

## 任务

- [x] 1. 项目脚手架与基础设施搭建
  - [x] 1.1 初始化 Next.js 项目与基础配置
    - 使用 `create-next-app` 初始化 TypeScript + Tailwind + App Router 项目
    - 安装核心依赖：prisma、@prisma/client、next-auth、ioredis、zod、lucide-react
    - 安装 shadcn/ui 并初始化组件库配置
    - 创建 `.env.example` 文件，列出所有必需环境变量（DATABASE_URL、REDIS_URL、NEXTAUTH_SECRET、NEXTAUTH_URL、SMTP_HOST 等）
    - 创建 `docker-compose.yml`，包含 web、postgres、redis 三个服务
    - 创建 `Dockerfile` 用于 Next.js 应用容器化
    - 创建项目 README 文件，包含项目简介、环境要求、启动步骤
    - _需求: 22.1, 22.2, 22.3, 22.4, 22.5_

  - [x] 1.2 配置 Prisma 数据库 Schema 与迁移
    - 创建 `prisma/schema.prisma`，定义设计文档中的全部数据模型（User、Account、Session、VerificationToken、Board、Tag、PostTag、Post、PostEditHistory、Comment、Like、Bookmark、Report、Case、TimelineEvent、Message、ConfideRequest、Notification、AuditLog、InviteCode、KnowledgeArticle、AccessApplication、SensitiveWord、WeeklyRecommendation）
    - 定义所有枚举类型（Role、BoardZone、PostStatus、PostVisibility、DCRCategory、ReportStatus、CaseStatus、ConfideStatus、NotificationType、SensitiveWordCategory、ArticleVisibility、ApplicationType、ApplicationStatus）
    - 配置索引（AuditLog 的 createdAt、action、operatorId 索引）
    - 创建 `lib/prisma.ts` Prisma 客户端单例
    - 运行 `prisma migrate dev` 生成初始迁移
    - _需求: 1.1, 1.6, 3.1, 4.6, 4.8, 4.9, 5.4, 6.1, 6.4, 7.1, 8.3, 9.1, 11.1, 11.6, 12.1, 14.1, 16.1, 16.2_

  - [x] 1.3 配置 Redis 客户端与基础工具库
    - 创建 `lib/redis.ts` Redis 客户端连接（ioredis）
    - 创建 `lib/validators.ts` 基础 zod 验证 schema（邮箱、昵称、帖子标题、帖子内容等）
    - 创建 `lib/utils.ts` 通用工具函数（生成匿名 ID、IP 哈希、日期格式化等）
    - _需求: 15.1, 19.3_

- [x] 2. 认证系统
  - [x] 2.1 实现 NextAuth 邮箱魔法链接认证
    - 创建 `lib/auth.ts` NextAuth 配置，使用 EmailProvider + PrismaAdapter
    - 配置魔法链接有效期为 15 分钟
    - 创建 `app/api/auth/[...nextauth]/route.ts` 认证路由
    - 实现登录页面 `app/(auth)/login/page.tsx`，包含邮箱输入表单和"发送魔法链接"按钮
    - 实现魔法链接过期提示与重新发送功能
    - _需求: 1.1, 1.2, 1.4, 1.6, 1.7_

  - [x] 2.2 实现邀请码注册
    - 创建 `app/api/auth/invite/route.ts` 邀请码注册接口
    - 验证邀请码有效性（未使用、未过期、未撤销）
    - 创建匿名账户并标记邀请码为已使用
    - 在登录页面添加邀请码注册入口和表单
    - _需求: 1.3, 1.5_

  - [x] 2.3 编写认证模块单元测试
    - 测试魔法链接发送与验证流程
    - 测试邀请码验证逻辑（有效、已使用、已过期、已撤销）
    - 测试会话创建与管理
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.4 实现认证中间件
    - 创建 `middleware.ts`，集成 NextAuth 会话验证
    - 配置受保护路由匹配规则（/create、/messages、/settings、/admin、/moderation、/dcr、/apply 等）
    - 未认证用户重定向至登录页
    - _需求: 1.2, 7.1, 21.4_

- [x] 3. 检查点 - 基础设施与认证验证
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证 Docker Compose 可正常启动所有服务
  - 验证邮箱魔法链接登录流程完整可用

- [x] 4. RBAC/ABAC 权限系统与限流器
  - [x] 4.1 实现 RBAC 权限定义与检查
    - 创建 `lib/rbac.ts`，定义角色权限映射表（User、TrustedUser、Moderator、Admin、DCRHelper）
    - 实现 `checkPermission(role, action, resource)` 权限检查函数
    - 实现 `withAuth(handler, requiredRole)` API 路由权限包装器
    - 注册用户默认分配 User 角色
    - _需求: 7.1, 7.2, 7.7_

  - [x] 4.2 实现 ABAC 属性策略引擎
    - 创建 `lib/abac.ts`，定义属性策略规则
    - 实现基于账号年龄的限制：不足 7 天限制每日发帖 3 篇、禁止进入私密区
    - 实现基于违规次数的限制：超过 3 次限制每日发帖 1 篇
    - 实现基于审核状态、签署守则、信誉等级的动态权限计算
    - 将 ABAC 检查集成到中间件中
    - _需求: 7.3, 7.4, 7.5, 7.6, 15.2_

  - [x] 4.3 实现 Redis 限流器
    - 创建 `lib/rate-limiter.ts`，基于 Redis 滑动窗口算法
    - 实现默认限制：每分钟 60 次请求
    - 实现按用户 ID 和 IP 哈希的限流键
    - 将限流器集成到 `middleware.ts`
    - 超出限制返回 429 状态码
    - _需求: 15.1, 19.3_

  - [x] 4.4 编写权限系统属性测试
    - **属性 1: RBAC 角色权限一致性** — 验证每个角色的权限集合符合设计定义
    - **验证: 需求 7.1, 7.2**
    - **属性 2: ABAC 属性限制正确性** — 验证账号年龄和违规次数限制逻辑
    - **验证: 需求 7.4, 7.5, 7.6**

- [x] 5. 敏感词引擎与审计日志
  - [x] 5.1 实现敏感词引擎
    - 创建 `lib/sensitive-engine.ts`，实现基于关键词匹配的敏感词检测
    - 支持四类敏感词：PII（个人可识别信息）、RISK（风险触发词）、PHISHING（钓鱼诱导）、PROFANITY（不当言论）
    - 实现 `scanContent(text)` 返回命中的敏感词列表及位置信息
    - 实现 `highlightSensitive(text, matches)` 返回带高亮标记的文本
    - 支持从数据库加载敏感词并缓存到 Redis
    - _需求: 15.5, 15.6, 10.3, 10.4, 29.6, 29.7_

  - [x] 5.2 实现审计日志模块
    - 创建 `lib/audit.ts`，实现 `logAudit(operatorId, action, targetType, targetId, details, ipHash)` 函数
    - 记录字段：操作时间戳、操作者 ID、操作类型、目标对象 ID、操作详情、IP 哈希
    - 确保审计日志记录不可删除、不可修改（仅 INSERT 操作）
    - _需求: 16.1, 16.2, 16.3_

  - [x] 5.3 编写敏感词引擎属性测试
    - **属性 3: 敏感词检测完整性** — 验证所有已注册敏感词均能被正确检测
    - **验证: 需求 15.5**
    - **属性 4: 审计日志不可篡改性** — 验证审计日志仅支持插入操作
    - **验证: 需求 16.3**

- [x] 6. 板块与标签管理
  - [x] 6.1 实现板块 CRUD API
    - 创建 `app/api/boards/route.ts` — GET（按权限过滤板块列表）、POST（Admin 创建板块）
    - 创建 `app/api/boards/[id]/route.ts` — PATCH（Admin 编辑板块）
    - 板块包含：名称、描述、区域（PUBLIC/PSYCHOLOGY/DCR）、排序权重、激活状态
    - 根据用户角色和准入状态过滤可见板块
    - _需求: 3.1, 3.2, 3.4, 3.5, 17.6_

  - [x] 6.2 实现标签 CRUD API
    - 创建 `app/api/tags/route.ts` — GET（标签列表）、POST（Moderator+ 创建标签）
    - 标签名称唯一性校验
    - _需求: 3.3_

- [x] 7. 检查点 - 权限系统与核心引擎验证
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证 RBAC/ABAC 权限检查正确拦截无权限请求
  - 验证敏感词引擎能正确检测各类敏感信息

- [x] 8. 布局组件与主题系统
  - [x] 8.1 实现 RootLayout 与主题 Provider
    - 创建 `app/layout.tsx` 根布局，集成 NextAuth SessionProvider 和 ThemeProvider（next-themes）
    - 配置 Tailwind 暗色模式（class 策略）
    - 定义浅色/深色主题 CSS 变量（shadcn/ui 主题配置）
    - 确保主题切换平滑过渡（transition duration 300ms）
    - _需求: 24.1, 24.2, 39.1_

  - [x] 8.2 实现 TopBar 顶部栏组件
    - 创建 `components/layout/TopBar.tsx`
    - 包含：左侧 Logo/返回按钮（非首页显示返回按钮）、中部搜索框、右侧发布按钮和消息铃铛
    - 消息铃铛显示未读数量角标
    - 页面顶部固定定位（sticky top-0）
    - _需求: 25.1, 25.2, 25.3, 25.4, 25.5_

  - [x] 8.3 实现 BottomNav 底部导航组件
    - 创建 `components/layout/BottomNav.tsx`
    - 包含五个入口：首页、发现、发布（凸起样式）、消息、我的
    - 高亮当前页面对应导航项
    - 移动端（< 1024px）显示，PC 端隐藏
    - 消息图标显示未读数量角标
    - _需求: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x] 8.4 实现 PC 端侧边栏/顶部 Tabs 导航
    - 创建 `components/layout/Sidebar.tsx`
    - PC 端（>= 1024px）显示侧边栏导航，替代底部导航
    - 根据用户角色和权限动态渲染导航菜单项
    - _需求: 23.6, 26.4, 21.4, 37.3_

  - [x] 8.5 实现 ThemeToggle 主题切换组件
    - 创建 `components/shared/ThemeToggle.tsx`
    - 深浅色切换按钮，平滑过渡动画
    - _需求: 24.1, 24.2, 39.1_

  - [x] 8.6 实现共享 UI 基础组件
    - 创建 `components/shared/Skeleton.tsx` 骨架屏组件（卡片骨架、列表骨架）
    - 创建 `components/shared/EmptyState.tsx` 空态组件（SVG 插画占位 + 行为引导按钮）
    - 创建 `components/shared/PrivacyBanner.tsx` 隐私提示条组件
    - 创建 `components/shared/CrisisAlert.tsx` 求助提示弹窗组件（紧急求助资源列表 + 热线按钮）
    - _需求: 27.4, 27.8, 38.1, 28.6, 8.7, 8.8, 35.1, 35.3_

- [x] 9. 帖子 CRUD 与 Feed 瀑布流
  - [x] 9.1 实现帖子 CRUD API
    - 创建 `app/api/posts/route.ts` — GET（分页列表，支持按板块、标签、排序筛选）、POST（创建帖子）
    - 创建 `app/api/posts/[id]/route.ts` — GET（详情）、PATCH（编辑）、DELETE（软删除）
    - 创建帖子时：公开区直接发布，DCR 区放入审核队列（状态 PENDING）
    - 编辑帖子时保存 PostEditHistory 记录
    - 软删除设置 status 为 DELETED
    - 帖子创建时执行敏感词检测
    - 实现 ABAC 发帖频率限制检查
    - Feed 查询过滤心理区和 DCR 区帖子，过滤 shadow banned 用户内容
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 4.9, 27.7, 15.4_

  - [x] 9.2 实现点赞与收藏 API
    - 创建 `app/api/posts/[id]/like/route.ts` — POST（点赞/取消点赞 toggle）
    - 创建 `app/api/posts/[id]/bookmark/route.ts` — POST（收藏/取消收藏 toggle）
    - 更新帖子 likeCount 计数
    - _需求: 4.6_

  - [x] 9.3 实现 PostCard 帖子卡片组件
    - 创建 `components/feed/PostCard.tsx`
    - 展示：封面图、标题、摘要（前 60 字符）、作者头像与昵称、点赞数、标签列表、所属分区
    - 卡片化样式：统一圆角（2xl）、轻柔阴影、充足留白（p-4）
    - 匿名帖子显示匿名标识和默认头像
    - _需求: 27.2, 23.1_

  - [x] 9.4 实现 WaterfallGrid 瀑布流布局组件
    - 创建 `components/feed/WaterfallGrid.tsx`
    - PC 端（>= 768px）2 列布局，移动端 1-2 列紧凑布局
    - 不等高卡片排列（类似小红书风格）
    - _需求: 27.1_

  - [x] 9.5 实现首页 Feed 页面
    - 创建 `app/(public)/page.tsx` 首页
    - 集成 WaterfallGrid + PostCard
    - 实现无限滚动加载（每次 20 条）
    - 提供"综合推荐"和"最新"两个 Tab 切换
    - 加载中展示 Skeleton 骨架屏
    - 列表为空展示 EmptyState
    - _需求: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.8_

  - [x] 9.6 编写帖子 CRUD 属性测试
    - **属性 5: 帖子发布权限一致性** — 验证公开区帖子直接发布、DCR 区帖子进入审核队列
    - **验证: 需求 4.1, 4.2**
    - **属性 6: 软删除不可逆性** — 验证软删除帖子不在列表中展示但数据保留
    - **验证: 需求 4.4**

- [x] 10. 帖子详情页与评论系统
  - [x] 10.1 实现 ImageCarousel 图片轮播组件
    - 创建 `components/post/ImageCarousel.tsx`
    - 支持左右滑动切换、图片计数指示器
    - 渐进式加载（先模糊缩略图，后清晰图片）
    - _需求: 28.2, 39.5_

  - [x] 10.2 实现帖子详情页
    - 创建 `app/(public)/post/[id]/page.tsx`
    - 展示：图片轮播、Markdown 渲染正文、作者信息卡（头像、昵称、发帖时间）
    - 底部固定操作栏：点赞、收藏、评论、分享按钮
    - 正文区域 max-w-2xl 限制宽度
    - 心理区/DCR 区帖子顶部显示 PrivacyBanner
    - _需求: 28.1, 28.2, 28.3, 28.6, 28.7, 23.3_

  - [x] 10.3 实现评论 CRUD API
    - 创建 `app/api/posts/[id]/comments/route.ts` — GET（评论列表）、POST（创建评论）
    - 创建 `app/api/comments/[id]/route.ts` — PATCH（编辑）、DELETE（软删除）
    - 支持嵌套回复（最大 3 层）
    - 待审核帖子禁止评论
    - 评论内容执行敏感词检测
    - 创建评论时生成通知
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 20.1_

  - [x] 10.4 实现 CommentDrawer 评论抽屉组件
    - 创建 `components/comment/CommentDrawer.tsx`
    - 从底部滑出的评论面板（shadcn/ui Sheet）
    - 支持楼中楼两层嵌套回复展示
    - 评论输入框 + 发送按钮
    - _需求: 28.4, 28.5_

  - [x] 10.5 编写评论系统单元测试
    - 测试嵌套回复深度限制（最大 3 层）
    - 测试待审核帖子禁止评论逻辑
    - 测试评论软删除
    - _需求: 5.4, 5.5, 5.3_

- [x] 11. 检查点 - 核心内容功能验证
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证首页 Feed 瀑布流正常展示
  - 验证帖子发布、编辑、删除流程完整
  - 验证评论抽屉交互正常

- [x] 12. 发布页与搜索功能
  - [x] 12.1 实现发布页
    - 创建 `app/(member)/create/page.tsx`
    - 包含：图片上传区（拖拽上传、多选、预览、拖拽排序、单张删除，最多 9 张）、标题输入框（最大 30 字符 + 计数提示）、正文 Markdown 编辑器、分区选择器、标签选择器
    - 私密区发帖展示"可见范围"选择器
    - 发布前执行敏感词预检，命中时高亮标记并阻止发布
    - _需求: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 39.3_

  - [x] 12.2 实现 SensitiveHighlight 敏感词高亮组件
    - 创建 `components/shared/SensitiveHighlight.tsx`
    - 高亮背景色标记命中的敏感词文本
    - 标记旁显示修改提示
    - _需求: 29.6, 29.7, 39.3_

  - [x] 12.3 实现搜索 API
    - 创建 `app/api/search/route.ts` — GET（全文搜索，支持按标题、标签、板块筛选）
    - 支持帖子、用户、话题三类搜索结果
    - 分页返回（每页 20 条）
    - 过滤用户无权限访问的私密区内容
    - _需求: 4.7, 31.1, 31.4, 31.5_

  - [x] 12.4 实现搜索结果页
    - 创建 `app/(public)/search/page.tsx`
    - 提供"帖子"、"用户"、"话题"三个 Tab 切换
    - 搜索结果为空展示 EmptyState
    - _需求: 31.1, 31.2, 31.3, 31.4_

- [x] 13. 举报系统与审核队列
  - [x] 13.1 实现举报 API
    - 创建 `app/api/reports/route.ts` — POST（提交举报）、GET（Moderator 获取举报列表）
    - 创建 `app/api/reports/[id]/route.ts` — PATCH（更新举报状态）
    - 举报状态流转：PENDING → IN_PROGRESS → RESOLVED/DISMISSED
    - 同一内容被 3 人以上举报时自动临时隐藏并通知 Moderator
    - 所有举报处理操作记录到 AuditLog
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 13.2 实现审核队列 API
    - 创建 `app/api/moderation/queue/route.ts` — GET（获取审核队列）
    - 创建 `app/api/moderation/[id]/approve/route.ts` — POST（批准内容）
    - 创建 `app/api/moderation/[id]/reject/route.ts` — POST（拒绝内容）
    - 审核操作记录到 AuditLog
    - _需求: 17.2, 34.4_

  - [x] 13.3 实现审核看板页面
    - 创建 `app/(admin)/moderation/page.tsx`
    - 看板形式展示：待审核、审核中、已通过、已拒绝四列
    - 点击卡片展示内容详情弹窗（帖子全文、作者信息、举报原因、审核按钮）
    - 支持按内容类型和板块筛选
    - 非 Moderator/Admin 访问返回 403
    - _需求: 34.1, 34.2, 34.3, 34.4, 34.5_

  - [x] 13.4 编写举报系统属性测试
    - **属性 7: 举报状态流转合法性** — 验证举报状态只能按 PENDING→IN_PROGRESS→RESOLVED/DISMISSED 流转
    - **验证: 需求 6.4**
    - **属性 8: 自动隐藏阈值** — 验证同一内容被 3 人以上举报时自动隐藏
    - **验证: 需求 6.5**

- [x] 14. 通知系统
  - [x] 14.1 实现通知 API
    - 创建 `app/api/notifications/route.ts` — GET（获取通知列表，分页）
    - 创建 `app/api/notifications/[id]/read/route.ts` — PATCH（标记已读）
    - 创建 `app/api/notifications/read-all/route.ts` — POST（全部标记已读）
    - 创建 `lib/notification.ts` 通知生成工具函数，支持所有通知类型（COMMENT、LIKE、REPORT_RESULT、CASE_UPDATE、DCR_ACCESS、PSYCH_MATCH、SYSTEM）
    - _需求: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 14.2 实现通知页面
    - 创建 `app/(member)/messages/page.tsx`
    - 时间倒序列表展示通知
    - 按类型分组：互动通知、系统通知
    - 点击通知导航至对应页面
    - 支持标记已读和批量标记已读
    - _需求: 33.1, 33.2, 33.3, 33.4, 33.5_

- [x] 15. 检查点 - 内容管理功能验证
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证发布页敏感词预检功能正常
  - 验证举报与审核流程完整
  - 验证通知生成与展示正常

- [x] 16. 用户资料与个人主页
  - [x] 16.1 实现用户资料 API
    - 创建 `app/api/users/[id]/route.ts` — GET（获取用户资料）、PATCH（更新资料）
    - 资料字段：昵称、头像、个人简介（均可选）
    - 昵称更新时执行敏感词检测
    - 查看他人资料仅展示昵称、头像、公开统计信息
    - _需求: 2.1, 2.2, 2.3, 2.4_

  - [x] 16.2 实现个人主页
    - 创建 `app/(member)/u/[id]/page.tsx`
    - 展示：头像、昵称、简介、加入时间
    - 三个 Tab：发帖、收藏、点赞
    - 查看自己主页展示全部 Tab，查看他人仅展示公开帖子
    - 帖子列表以卡片形式展示
    - _需求: 32.1, 32.2, 32.3, 32.4, 32.5_

  - [x] 16.3 实现个人设置页面
    - 创建 `app/(member)/settings/profile/page.tsx`
    - 资料编辑表单（昵称、头像上传、简介）
    - 主题切换设置
    - _需求: 2.1, 2.2, 24.1_

- [x] 17. 发现页
  - [x] 17.1 实现发现页 API
    - 扩展 `app/api/tags/route.ts` 支持热门话题查询（按帖子数量排序）
    - 扩展 `app/api/boards/route.ts` 支持热门板块查询
    - 创建 `app/api/recommendations/route.ts` — GET（每周编辑推荐列表）
    - _需求: 30.1, 30.2, 30.4, 30.5_

  - [x] 17.2 实现发现页
    - 创建 `app/(public)/discover/page.tsx`
    - 热门话题网格卡片（话题名称 + 帖子数量）
    - 热门板块横向滚动列表（板块名称、描述、帖子数量）
    - 每周栏目编辑推荐区域
    - 点击话题卡片导航至话题帖子列表
    - 下拉刷新功能
    - _需求: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6_

- [x] 18. 新手引导与合规文档
  - [x] 18.1 实现新手引导页面
    - 创建 `app/(auth)/onboarding/page.tsx`
    - 新手引导流程（平台介绍、社区规范、基础操作指引）
    - 新手测验功能（通过后标记 quizPassed）
    - 首次登录自动重定向至新手引导
    - _需求: 15.3, 21.5, 7.3_

  - [x] 18.2 实现合规文档页面
    - 创建 `app/help/policies/page.tsx` 合规文档集合页
    - 包含：用户协议、社区规范、隐私政策、免责声明四个文档
    - 注册流程中展示用户协议并要求勾选同意
    - _需求: 18.1, 18.2, 18.3, 18.4, 18.5_

- [x] 19. 心理交流区
  - [x] 19.1 实现心理区准入 API
    - 创建 `app/api/psych/apply/route.ts` — POST（申请心理区准入）
    - 创建准入申请记录，交由 Moderator 审核
    - 审核通过后设置用户 psychAccess = true
    - _需求: 8.1, 8.2_

  - [x] 19.2 实现心理区申请页面
    - 创建 `app/(psych)/apply/page.tsx`
    - 展示准入说明、倾听者守则摘要、申请按钮
    - _需求: 8.6, 35.5_

  - [x] 19.3 实现匿名树洞发帖功能
    - 扩展帖子创建 API，心理区发帖时自动设置 isAnonymous=true 并生成随机匿名标识
    - 心理区帖子使用默认匿名头像
    - _需求: 8.3, 35.2_

  - [x] 19.4 实现倾听匹配系统 API
    - 创建 `app/api/psych/confide/route.ts` — POST（提交倾诉请求）
    - 创建 `app/api/psych/queue/route.ts` — GET（Listener 获取匹配队列，仅展示摘要）
    - 创建 `app/api/psych/match/[id]/route.ts` — POST（Listener 领取倾诉请求）
    - 创建 `app/api/psych/session/[id]/close/route.ts` — POST（结束倾听会话）
    - 创建匿名消息通道，双方使用随机匿名标识
    - 会话消息持续监测风险触发词
    - 检测到严重风险触发词时弹出求助提示并通知 Moderator
    - 会话关闭后保留记录 30 天（设置 expiresAt）
    - _需求: 8.4, 8.5, 8.7, 8.8, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 19.5 实现心理区 UI 组件
    - 心理区页面使用温暖柔和配色方案（浅暖色调背景、圆润图标）
    - 所有页面顶部显示安全提示条
    - 风险触发词弹窗（CrisisAlert 组件集成）
    - 一键提示按钮（求助热线信息）
    - _需求: 35.1, 35.2, 35.3, 35.4, 8.7, 8.8, 8.9_

  - [x] 19.6 编写倾听匹配属性测试
    - **属性 9: 倾诉请求匿名性** — 验证 Listener 浏览队列时无法获取发起者身份
    - **验证: 需求 12.2**
    - **属性 10: 风险触发词检测覆盖** — 验证会话消息中的风险触发词被正确检测
    - **验证: 需求 12.4, 12.5**

- [x] 20. 检查点 - 用户功能与心理区验证
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证个人主页、发现页正常展示
  - 验证心理区准入、匿名发帖、倾听匹配流程完整

- [x] 21. DCR 私密区
  - [x] 21.1 实现 DCR 准入 API
    - 创建 `app/api/dcr/apply/route.ts` — POST（申请 DCR 准入，需签署守则声明）
    - 创建 `app/api/dcr/apply/[id]/route.ts` — PATCH（Admin 审核准入申请）
    - 审核时检查账号年龄、违规记录、信誉等级
    - 实施冷启动限额（初始最多 50 名用户）
    - 审核通过后设置 dcrAccess=true、dcrPledgeSigned=true
    - _需求: 9.1, 9.2, 9.3, 9.4_

  - [x] 21.2 实现 DCR 入口页面
    - 创建 `app/(dcr)/dcr/page.tsx`
    - 展示私密区说明、准入要求、合规声明、申请入口按钮
    - _需求: 36.1_

  - [x] 21.3 实现 DCR 四步发帖向导（Wizard）
    - 创建 `components/dcr/WizardStepper.tsx` 向导步骤器组件（进度指示器）
    - 创建 `app/(dcr)/dcr/tickets/new/page.tsx` 新建工单页面
    - 第一步：事项类型选择（补课/收费/双休/其他）
    - 第二步：结构化表单填写（根据类型展示对应模板）
    - 第三步：隐私检查（敏感信息扫描，检测并高亮标记可识别信息，要求修改后继续）
    - 第四步：强制声明勾选（"已移除可识别信息" + "了解平台不组织不指挥不实施"）
    - 完成后生成 DelegationForm 提交至审核队列
    - _需求: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 9.5, 9.6_

  - [x] 21.4 实现 DCR 工单 CRUD API
    - 创建 `app/api/cases/route.ts` — POST（创建工单）、GET（工单列表）
    - 创建 `app/api/cases/[id]/route.ts` — GET（工单详情）、PATCH（更新状态）
    - 创建 `app/api/cases/[id]/timeline/route.ts` — GET（工单时间线）
    - 创建 `app/api/cases/[id]/export/route.ts` — GET（Admin 导出 CSV，二次脱敏）
    - 工单状态流转：OPENED → IN_PROGRESS → NEED_MORE_INFO → CLOSED
    - DCRHelper 接单时创建专属会话通道，限制同时处理上限 5 个
    - 每个状态变更生成 TimelineEvent
    - 所有访问和导出操作记录到 AuditLog
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 21.5 实现 DCR 工单列表与详情页面
    - 创建 `app/(dcr)/dcr/tickets/page.tsx` 工单列表页
    - 卡片列表展示，支持按状态筛选
    - 创建 `app/(dcr)/dcr/tickets/[id]/page.tsx` 工单详情页
    - 创建 `components/dcr/TimelineView.tsx` 时间线组件
    - 展示工单所有状态变更和跟进记录
    - Admin 角色显示"导出 CSV"按钮，非 Admin 隐藏
    - DCR 区所有页面顶部显示 PrivacyBanner
    - _需求: 36.2, 36.3, 36.4, 36.5, 36.6, 36.7_

  - [x] 21.6 编写 DCR 工单属性测试
    - **属性 11: 工单状态流转合法性** — 验证工单状态只能按 OPENED→IN_PROGRESS→NEED_MORE_INFO→CLOSED 流转
    - **验证: 需求 11.1**
    - **属性 12: DCRHelper 并发限制** — 验证每个 DCRHelper 同时处理的 Case 不超过 5 个
    - **验证: 需求 13.3**
    - **属性 13: CSV 导出二次脱敏** — 验证导出数据经过脱敏处理
    - **验证: 需求 11.7**

- [x] 22. 知识库
  - [x] 22.1 实现知识库 API
    - 创建 `app/api/kb/route.ts` — GET（文章列表，按权限过滤）、POST（Admin 创建文章）
    - 创建 `app/api/kb/[id]/route.ts` — GET（文章详情）、PATCH（Admin 编辑文章）
    - 创建 `app/api/kb/search/route.ts` — GET（全文搜索）
    - 公开文章对所有用户可见，DCR 专属文章仅对 DCR 区用户可见
    - _需求: 14.1, 14.3, 14.4, 14.5_

  - [x] 22.2 实现知识库页面
    - 创建 `app/(public)/kb/page.tsx` 知识库列表页（分类文章列表 + 搜索框）
    - 创建 `app/(public)/kb/[id]/page.tsx` 文章详情页（Markdown 渲染）
    - _需求: 14.1, 14.4_

- [x] 23. 检查点 - DCR 区与知识库验证
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证 DCR 准入、四步向导、工单流转完整
  - 验证知识库文章展示与权限过滤正常

- [x] 24. 管理后台
  - [x] 24.1 实现管理后台用户管理
    - 创建 `app/api/admin/users/route.ts` — GET（用户列表，支持按角色、状态、注册时间筛选）
    - 创建 `app/api/admin/users/[id]/role/route.ts` — PATCH（变更角色，记录 AuditLog）
    - 创建 `app/api/admin/users/[id]/ban/route.ts` — POST（封禁/解封，记录 AuditLog）
    - 实现 Shadow Ban 功能（isShadowBanned 标记）
    - 创建 `app/(admin)/admin/users/page.tsx` 用户管理页面
    - _需求: 17.1, 7.7, 15.4_

  - [x] 24.2 实现邀请码管理
    - 创建 `app/api/admin/invites/route.ts` — GET（邀请码列表）、POST（生成邀请码）
    - 创建 `app/api/admin/invites/[id]/route.ts` — DELETE（撤销邀请码）
    - 创建 `app/(admin)/admin/invites/page.tsx` 邀请码管理页面
    - _需求: 17.3_

  - [x] 24.3 实现审计日志查询
    - 创建 `app/api/admin/audit/route.ts` — GET（审计日志列表，支持按时间范围、操作类型、操作者筛选，分页）
    - 创建 `app/(admin)/admin/audit/page.tsx` 审计日志页面（筛选 + 列表 + 导出）
    - _需求: 16.4, 16.5, 17.4_

  - [x] 24.4 实现管理后台板块管理
    - 创建 `app/(admin)/admin/boards/page.tsx` 板块管理页面
    - 支持创建、编辑、排序、设置可见性
    - _需求: 17.6_

  - [x] 24.5 实现管理后台访问控制
    - 非 Admin/Moderator 角色访问 /admin/* 返回 403 并记录 AuditLog
    - _需求: 17.5_

- [x] 25. 错误页面与无障碍
  - [x] 25.1 实现错误页面
    - 创建 `app/not-found.tsx` — 404 页面（"页面未找到"提示、插画、返回首页按钮）
    - 创建 `app/(public)/403/page.tsx` 或自定义 403 组件 — 403 页面（"无权限访问"提示、插画、返回首页按钮）
    - 创建 `app/error.tsx` — 500 页面（"服务器错误"提示、插画、重试按钮）
    - 实现网络请求失败 Toast 提示（错误信息 + 重试选项）
    - _需求: 37.4, 37.5, 37.6, 38.2, 38.3, 38.4, 38.5_

  - [x] 25.2 实现无障碍合规
    - 确保所有文本与背景颜色对比度达到 WCAG 2.1 AA 级标准
    - 确保所有交互元素可通过键盘 Tab 聚焦和 Enter/Space 操作
    - 为所有图片和图标提供 alt 文本或 aria-label
    - 确保所有表单控件具有关联的 label 或 aria-labelledby
    - 确保所有可点击元素最小触摸区域 44x44 像素
    - 所有按钮提供视觉反馈（按下态缩放或颜色变化，延迟 < 100ms）
    - _需求: 24.3, 24.4, 24.5, 24.6, 39.2, 39.6_

- [x] 26. 信誉系统与安全加固
  - [x] 26.1 实现信誉等级系统
    - 创建 `lib/reputation.ts`，基于发帖质量、举报记录、违规次数动态计算信誉分
    - 信誉分影响 ABAC 权限计算
    - _需求: 15.7_

  - [x] 26.2 实现安全加固措施
    - IP 地址单向哈希存储（已在 utils 中实现，确保全局使用）
    - API 响应移除服务器版本信息和调试头（Next.js headers 配置）
    - CSRF 保护（NextAuth 内置）、XSS 防护（React 默认转义 + CSP 头）
    - 异常登录检测：5 分钟内 3 个以上不同 IP 哈希登录时临时锁定账户并通知 Admin
    - _需求: 19.1, 19.2, 19.3, 19.6, 19.7, 19.8_

  - [x] 26.3 实现数据清理定时任务
    - 超过 90 天未活跃的匿名会话数据自动清理
    - 超过 180 天的已关闭 Case 数据脱敏归档
    - 超过 180 天的 AuditLog 记录自动归档
    - 倾听会话记录 30 天后自动清理
    - _需求: 19.4, 19.5, 16.5, 12.6_

- [x] 27. 检查点 - 管理后台与安全验证
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证管理后台各功能页面正常
  - 验证权限拦截与审计日志记录完整

- [x] 28. 种子数据与最终集成
  - [x] 28.1 创建种子数据脚本
    - 创建 `prisma/seed.ts` 种子数据脚本
    - 预置公开区板块：娱乐、工具使用、AI 效率、基础编程、隐私与账号安全科普、公告
    - 预置心理区和 DCR 区板块
    - 预置常用标签
    - 预置 8-12 篇知识库种子文章（政策学习与合规渠道说明）
    - 预置敏感词库（PII、RISK、PHISHING、PROFANITY 四类）
    - 预置新手测验题目
    - 预置管理员账户
    - 在 `package.json` 中配置 `prisma.seed` 命令
    - _需求: 3.5, 14.2, 8.9, 15.3_

  - [x] 28.2 全局路由与导航集成
    - 确保所有页面路由按设计文档正确配置
    - 验证导航菜单根据用户角色动态渲染
    - 验证所有页面间跳转链接正确
    - 验证 TopBar 搜索框导航至 /search?q= 页面
    - 验证 BottomNav 各入口导航正确
    - _需求: 21.1, 21.2, 21.3, 21.4, 37.1, 37.2, 37.3_

  - [x] 28.3 响应式布局最终调整
    - 验证移动端优先布局在各断点正常显示
    - 移动端：底部导航、触摸友好按钮尺寸、滑动手势
    - PC 端（>= 1024px）：侧边栏替代底部导航
    - 帖子详情页 max-w-2xl 宽度限制
    - 卡片组件统一圆角（2xl）、轻柔阴影、充足留白
    - _需求: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

- [x] 29. 最终检查点 - 全功能验证
  - 确保所有测试通过，如有问题请向用户确认。
  - 验证 Docker Compose 一键启动完整环境
  - 验证种子数据正确加载
  - 验证所有核心用户流程端到端可用
  - 验证暗色模式在所有页面正常显示
  - 验证无障碍键盘导航和屏幕阅读器兼容性

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点任务确保增量验证，及早发现问题
- 属性测试验证核心业务规则的正确性
- 单元测试验证具体示例和边界条件
