# 需求文档：学生交流社区平台

## 简介

学生交流社区平台是一个面向学生群体的多层级社区系统，包含三个核心区域：公开区（娱乐与技术科普）、半私密心理交流区（同伴倾听与情绪支持）、私密 DCR 区（权益信息互助与合规工单流转）。平台以"合规化、多元化、稳定化"为硬约束，严格遵循最小化数据原则，不组织/不指挥/不实施任何举报或对抗行动，不提供绕过平台或监管的技巧，不收集不必要的敏感信息。

技术栈：Next.js 14/15 + TypeScript + Tailwind + shadcn/ui + PostgreSQL + Prisma + Redis + Docker Compose。认证采用 NextAuth 邮箱魔法链接，可选匿名口令邀请码注册。

## 术语表

- **Platform（平台）**：学生交流社区平台系统整体
- **User（用户）**：在平台注册的学生用户
- **TrustedUser（受信用户）**：通过新手测验且无违规记录的用户，拥有更多操作权限
- **Moderator（版主）**：负责内容审核与举报处理的管理角色
- **Admin（管理员）**：拥有全部管理权限的系统管理员
- **DCRHelper（DCR 协助者）**：在 DCR 私密区负责接单与跟进工单的志愿者角色
- **Post（帖子）**：用户发布的内容单元，包含标题、正文、标签、分类
- **Comment（评论）**：用户对帖子的回复内容
- **Board（板块）**：帖子的分类容器，对应公开区、心理区、DCR 区等
- **Report（举报）**：用户对违规内容或用户的投诉记录
- **Case（工单）**：DCR 区的结构化互助请求，包含完整的状态流转
- **AuditLog（审计日志）**：记录所有敏感操作的不可篡改日志
- **InviteCode（邀请码）**：用于匿名注册或私密区准入的一次性口令
- **Listener（倾听者）**：心理交流区的志愿者，负责领取倾诉请求并提供同伴支持
- **SensitiveWordEngine（敏感词引擎）**：对内容进行敏感词检测与拦截的规则引擎
- **DelegationForm（委托表）**：DCR 区的结构化表单，用于生成脱敏后的委托信息
- **KnowledgeBase（知识库）**：DCR 区的文章库，包含政策学习与合规渠道说明
- **RBAC（基于角色的访问控制）**：根据用户角色授予权限的访问控制模型
- **ABAC（基于属性的访问控制）**：根据用户属性（审核状态、账号年龄、违规次数等）动态限制的访问控制模型
- **ModerationQueue（审核队列）**：待审核内容的 Redis 队列
- **RateLimiter（限流器）**：基于 Redis 的请求频率限制组件
- **Wizard（发帖向导）**：DCR 区的四步引导式发帖流程
- **Feed（信息流）**：首页瀑布流卡片列表，展示帖子摘要与封面图
- **WaterfallLayout（瀑布流布局）**：多列不等高卡片排列方式，类似小红书风格
- **TopBar（顶部栏）**：页面顶部固定导航组件，包含 Logo/返回、搜索框、发布按钮和消息铃铛
- **BottomNav（底部导航）**：移动端固定底部导航栏，包含首页、发现、发布、消息、我的五个入口
- **PostDetail（帖子详情页）**：沉浸式阅读页面，包含图片轮播、Markdown 渲染、作者信息卡和评论抽屉
- **CommentDrawer（评论抽屉）**：从底部滑出的评论面板，支持楼中楼两层嵌套
- **DiscoverPage（发现页）**：话题标签广场、热门板块横向滚动和每周栏目编辑推荐页面
- **CreatePage（发布页）**：图文发布页面，支持图片上传、标题、正文、标签和分区选择
- **DarkMode（暗色模式）**：深色主题配色方案，可由用户手动切换
- **Skeleton（骨架屏）**：内容加载时展示的占位动画组件
- **EmptyState（空态）**：列表无数据时展示的插画占位与行为引导组件
- **PrivacyBanner（隐私提示条）**：帖子页面顶部固定的脱敏提示横幅
- **ModerationDashboard（审核看板）**：管理后台的审核队列可视化看板

## 需求

### 需求 1：用户认证与注册

**用户故事：** 作为学生用户，我希望通过邮箱魔法链接或邀请码注册并登录平台，以便安全地访问社区功能。

#### 验收标准

1. WHEN 用户提交有效邮箱地址, THE Platform SHALL 发送包含一次性魔法链接的认证邮件，链接有效期为 15 分钟
2. WHEN 用户点击有效的魔法链接, THE Platform SHALL 创建认证会话并将用户重定向至首页
3. WHEN 用户提交有效的邀请码, THE Platform SHALL 创建匿名账户并将该邀请码标记为已使用
4. IF 用户提交已过期的魔法链接, THEN THE Platform SHALL 显示"链接已过期"提示并提供重新发送选项
5. IF 用户提交无效或已使用的邀请码, THEN THE Platform SHALL 显示"邀请码无效"提示并拒绝注册
6. THE Platform SHALL 在用户注册时仅收集邮箱地址（或匿名标识），不收集真实姓名、手机号等非必要个人信息
7. WHEN 用户请求找回账户, THE Platform SHALL 通过邮箱验证身份后允许重新登录

### 需求 2：用户资料管理

**用户故事：** 作为注册用户，我希望管理我的个人资料，以便在社区中展示最小化的个人信息。

#### 验收标准

1. THE Platform SHALL 提供个人资料编辑页面，仅包含昵称、头像、个人简介三个可选字段
2. WHEN 用户更新个人资料, THE Platform SHALL 验证输入内容并保存更改
3. THE Platform SHALL 对用户昵称进行敏感词检测，拒绝包含违规内容的昵称
4. WHEN 用户查看他人资料, THE Platform SHALL 仅展示昵称、头像和公开统计信息（发帖数、加入时间）

### 需求 3：板块与标签管理

**用户故事：** 作为管理员，我希望管理社区板块和标签体系，以便组织和分类社区内容。

#### 验收标准

1. THE Platform SHALL 支持三级板块结构：公开区、半私密心理区、私密 DCR 区
2. WHEN Admin 创建或编辑板块, THE Platform SHALL 保存板块名称、描述、可见性级别和排序权重
3. THE Platform SHALL 支持为帖子添加多个标签，标签由 Admin 或 Moderator 预定义
4. WHEN User 浏览板块列表, THE Platform SHALL 仅展示该用户有权限访问的板块
5. THE Platform SHALL 为公开区预置以下板块：娱乐、工具使用、AI 效率、基础编程、隐私与账号安全科普、公告

### 需求 4：帖子发布与管理

**用户故事：** 作为注册用户，我希望在有权限的板块中发布、编辑和删除帖子，以便参与社区交流。

#### 验收标准

1. WHEN User 在公开区发布帖子, THE Platform SHALL 保存帖子并立即展示（无需审核）
2. WHEN User 在私密 DCR 区发布帖子, THE Platform SHALL 将帖子放入 ModerationQueue，状态设为"待审核"，审核通过后方可展示
3. WHEN User 编辑自己的帖子, THE Platform SHALL 保存编辑记录并更新帖子内容
4. WHEN User 删除自己的帖子, THE Platform SHALL 执行软删除，保留数据但不再展示
5. IF User 尝试在无权限的板块发帖, THEN THE Platform SHALL 返回 403 错误并提示权限不足
6. THE Platform SHALL 支持帖子的点赞、收藏功能，并记录操作用户和时间戳
7. WHEN User 搜索帖子, THE Platform SHALL 支持按标题、标签、板块进行全文搜索并返回分页结果
8. THE Platform SHALL 为 DCR 区帖子支持以下分类：补课、收费、双休、其他
9. THE Platform SHALL 为 DCR 区帖子支持以下可见性级别：public、matched、modsOnly，默认值为 matched

### 需求 5：评论系统

**用户故事：** 作为注册用户，我希望对帖子发表评论，以便与其他用户交流讨论。

#### 验收标准

1. WHEN User 对帖子发表评论, THE Platform SHALL 保存评论并关联到对应帖子
2. WHEN User 编辑自己的评论, THE Platform SHALL 保存编辑记录并更新评论内容
3. WHEN User 删除自己的评论, THE Platform SHALL 执行软删除
4. THE Platform SHALL 支持评论的嵌套回复，最大嵌套深度为 3 层
5. WHILE 帖子处于"待审核"状态, THE Platform SHALL 禁止对该帖子发表评论

### 需求 6：举报与处理

**用户故事：** 作为注册用户，我希望举报违规内容或用户，以便维护社区环境。

#### 验收标准

1. WHEN User 提交举报, THE Platform SHALL 创建 Report 记录，状态设为"待处理"，并记录举报人、被举报内容、举报原因
2. WHEN Moderator 开始处理举报, THE Platform SHALL 将 Report 状态更新为"处理中"
3. WHEN Moderator 完成举报处理, THE Platform SHALL 将 Report 状态更新为"已处理"或"驳回"，并记录处理结果
4. THE Platform SHALL 支持以下举报状态流转：待处理 → 处理中 → 已处理/驳回
5. IF 同一内容被 3 名以上不同 User 举报, THEN THE Platform SHALL 自动将该内容临时隐藏并通知 Moderator 优先处理
6. THE Platform SHALL 记录所有举报处理操作到 AuditLog


### 需求 7：RBAC 与 ABAC 权限控制

**用户故事：** 作为平台运营者，我希望通过角色和属性双重机制控制用户权限，以便实现精细化的访问管理。

#### 验收标准

1. THE Platform SHALL 支持以下角色：User、TrustedUser、Moderator、Admin、DCRHelper
2. WHEN User 注册成功, THE Platform SHALL 默认分配 User 角色
3. WHEN User 通过新手测验且无违规记录, THE Platform SHALL 允许 Admin 将其升级为 TrustedUser
4. THE Platform SHALL 基于以下属性动态计算访问权限：是否通过审核、是否签署私密区守则、账号年龄、违规次数
5. WHILE User 的违规次数超过 3 次, THE Platform SHALL 限制该 User 的发帖频率为每日 1 篇
6. IF User 的账号年龄不足 7 天, THEN THE Platform SHALL 限制该 User 每日发帖上限为 3 篇且禁止进入私密区
7. WHEN Admin 修改任何用户的角色, THE Platform SHALL 记录角色变更到 AuditLog

### 需求 8：半私密心理交流区

**用户故事：** 作为需要情绪支持的学生，我希望在安全的半私密环境中匿名倾诉，以便获得同伴倾听与情绪支持。

#### 验收标准

1. WHEN User 申请进入心理交流区, THE Platform SHALL 创建准入申请并交由 Moderator 审核
2. WHEN Moderator 批准准入申请, THE Platform SHALL 授予该 User 心理交流区的访问权限
3. THE Platform SHALL 在心理交流区提供匿名树洞功能，发帖时自动隐藏用户真实身份，使用随机生成的匿名标识
4. WHEN User 提交倾诉请求, THE Platform SHALL 将请求放入倾听匹配队列
5. WHEN Listener 领取倾诉请求, THE Platform SHALL 创建一对一匿名会话通道
6. THE Platform SHALL 在心理交流区显著位置展示倾听者守则页面
7. THE Platform SHALL 在每个会话页面提供一键提示按钮，内容为"必要时请联系可信成人或当地紧急与心理援助资源"，并附带求助热线信息
8. WHEN 帖子或消息内容包含严重风险触发词, THE Platform SHALL 自动弹出求助提示弹窗，展示紧急求助资源列表
9. THE Platform SHALL 维护可配置的风险触发词列表，由 Admin 管理

### 需求 9：DCR 私密区准入与权限

**用户故事：** 作为平台运营者，我希望对 DCR 私密区实施严格的准入控制，以便确保信息安全与合规。

#### 验收标准

1. THE Platform SHALL 对 DCR 私密区实施白名单准入机制，仅经人工审核批准的用户可访问
2. WHEN User 申请进入 DCR 私密区, THE Platform SHALL 要求用户签署私密区守则声明
3. WHEN Admin 审核 DCR 准入申请, THE Platform SHALL 检查用户的账号年龄、违规记录和信誉等级
4. THE Platform SHALL 对 DCR 私密区实施冷启动限额，初始阶段最多允许 50 名用户准入
5. WHILE User 处于 DCR 私密区, THE Platform SHALL 在每个页面顶部显示脱敏提示："请勿在帖子中包含真实姓名、学校名称、教师姓名等可识别信息"
6. THE Platform SHALL 对 DCR 私密区所有帖子强制执行先审后发机制

### 需求 10：DCR 委托表生成器

**用户故事：** 作为 DCR 区用户，我希望通过结构化表单生成脱敏的委托信息，以便安全地提交互助请求。

#### 验收标准

1. THE Platform SHALL 提供四步发帖向导（Wizard）：事项类型选择 → 结构化表单填写 → 隐私检查（敏感信息扫描） → 强制声明勾选
2. WHEN User 完成 Wizard 第一步, THE Platform SHALL 根据事项类型（补课/收费/双休/其他）展示对应的结构化表单模板
3. WHEN User 完成 Wizard 第二步, THE Platform SHALL 对表单内容执行敏感信息扫描，检测并标记可能的真实姓名、学校名称、电话号码等可识别信息
4. IF 敏感信息扫描发现可识别信息, THEN THE Platform SHALL 高亮标记并要求 User 修改后方可继续
5. WHEN User 完成 Wizard 第三步, THE Platform SHALL 展示强制声明勾选项，内容包括"我确认已移除所有可识别个人信息"和"我了解平台不组织、不指挥、不实施任何举报或对抗行动"
6. WHEN User 完成全部四步, THE Platform SHALL 生成 DelegationForm 并提交至 ModerationQueue

### 需求 11：DCR 工单流转

**用户故事：** 作为 DCR 区用户，我希望提交的互助请求能够被有序跟进和处理，以便获得有效的信息互助。

#### 验收标准

1. THE Platform SHALL 支持以下工单状态流转：opened → inProgress → needMoreInfo → closed
2. WHEN DelegationForm 审核通过, THE Platform SHALL 创建 Case 记录，状态设为 opened
3. WHEN DCRHelper 申请接单, THE Platform SHALL 将 Case 分配给该 DCRHelper 并创建专属会话通道，状态更新为 inProgress
4. WHEN DCRHelper 需要补充信息, THE Platform SHALL 将 Case 状态更新为 needMoreInfo 并通知提交者
5. WHEN DCRHelper 完成跟进, THE Platform SHALL 将 Case 状态更新为 closed 并生成 TimelineEvent 记录
6. THE Platform SHALL 为每个 Case 维护完整的 TimelineEvent 时间线，记录所有状态变更和操作
7. WHEN Admin 导出工单数据为 CSV, THE Platform SHALL 在导出前对所有字段执行二次脱敏处理
8. THE Platform SHALL 记录所有 Case 的访问和导出操作到 AuditLog

### 需求 12：倾听匹配系统

**用户故事：** 作为心理交流区的倾听志愿者，我希望领取倾诉请求并提供同伴支持，以便帮助有需要的同学。

#### 验收标准

1. WHEN User 在心理交流区提交倾诉请求, THE Platform SHALL 创建匿名倾诉记录并放入匹配队列
2. WHEN Listener 浏览可领取的倾诉请求, THE Platform SHALL 仅展示请求摘要，隐藏发起者身份
3. WHEN Listener 领取倾诉请求, THE Platform SHALL 创建一对一匿名消息通道，双方使用随机生成的匿名标识
4. WHILE 倾听会话进行中, THE Platform SHALL 持续监测消息内容中的风险触发词
5. IF 倾听会话中检测到严重风险触发词, THEN THE Platform SHALL 向双方弹出求助提示并通知 Moderator
6. WHEN 任一方结束倾听会话, THE Platform SHALL 关闭消息通道并保留会话记录 30 天后自动清理


### 需求 13：DCR 互助匹配

**用户故事：** 作为 DCR 区用户，我希望发布互助请求帖后能匹配到合适的 DCRHelper，以便获得一对一的信息互助。

#### 验收标准

1. WHEN User 在 DCR 区发布互助请求帖, THE Platform SHALL 将帖子标记为"待匹配"状态
2. WHEN DCRHelper 申请接单, THE Platform SHALL 创建 Case 并建立 DCRHelper 与请求者之间的专属匿名会话
3. THE Platform SHALL 限制每个 DCRHelper 同时处理的 Case 数量上限为 5 个
4. WHEN Case 创建成功, THE Platform SHALL 为该 Case 生成唯一的进度追踪页面
5. THE Platform SHALL 在 Case 专属会话中提供消息发送功能，消息内容经过敏感信息扫描

### 需求 14：知识库

**用户故事：** 作为 DCR 区用户，我希望查阅知识库中的政策学习与合规渠道说明文章，以便了解相关权益信息。

#### 验收标准

1. THE Platform SHALL 提供知识库页面（/kb），展示分类文章列表
2. THE Platform SHALL 预置 8 至 12 篇种子文章，涵盖政策学习与合规渠道说明
3. WHEN Admin 创建或编辑知识库文章, THE Platform SHALL 保存文章标题、正文、分类和发布状态
4. WHEN User 搜索知识库, THE Platform SHALL 支持按标题和正文内容进行全文搜索
5. THE Platform SHALL 根据用户权限级别控制知识库文章的可见性（公开文章对所有用户可见，DCR 专属文章仅对 DCR 区用户可见）

### 需求 15：反滥用与风控

**用户故事：** 作为平台运营者，我希望平台具备完善的反滥用机制，以便防止恶意行为和信息泄露。

#### 验收标准

1. THE RateLimiter SHALL 对所有 API 端点实施请求频率限制，默认限制为每分钟 60 次请求
2. WHILE User 的账号年龄不足 7 天, THE Platform SHALL 对该 User 实施新手限制：每日发帖上限 3 篇、禁止进入私密区、禁止私信
3. THE Platform SHALL 提供新手测验功能，User 通过测验后方可解除部分新手限制
4. WHEN Moderator 对 User 执行 Shadow Ban, THE Platform SHALL 使该 User 的内容仅对自己可见，对其他用户不可见
5. THE SensitiveWordEngine SHALL 在帖子和评论提交时扫描内容，拦截包含敏感信息（真实姓名、学校名称、电话号码、身份证号）的内容
6. THE Platform SHALL 对疑似钓鱼内容（诱导提供个人信息、诱导线下见面）进行检测并标记
7. THE Platform SHALL 维护信誉等级系统，基于用户的发帖质量、举报记录、违规次数动态计算信誉分

### 需求 16：审计日志

**用户故事：** 作为管理员，我希望所有敏感操作都被记录到审计日志中，以便追溯和审查。

#### 验收标准

1. THE Platform SHALL 为以下操作记录 AuditLog：用户角色变更、内容审核决定、举报处理、DCR 区访问、工单导出、用户封禁/解封、板块权限变更
2. THE AuditLog SHALL 记录以下字段：操作时间戳、操作者 ID、操作类型、目标对象 ID、操作详情、IP 地址（哈希后存储）
3. THE Platform SHALL 禁止任何角色删除或修改 AuditLog 记录
4. WHEN Admin 查看审计日志, THE Platform SHALL 支持按时间范围、操作类型、操作者进行筛选和分页查询
5. THE Platform SHALL 对超过 180 天的 AuditLog 记录执行自动归档

### 需求 17：管理后台

**用户故事：** 作为管理员和版主，我希望通过管理后台高效地管理用户、审核内容和处理举报，以便维护社区秩序。

#### 验收标准

1. WHEN Admin 访问用户管理页面（/admin/users）, THE Platform SHALL 展示用户列表，支持按角色、状态、注册时间筛选，并提供封禁/解封、角色变更操作
2. WHEN Moderator 访问审核队列页面（/admin/modqueue）, THE Platform SHALL 展示待审核内容列表，支持批准/拒绝操作
3. WHEN Admin 访问邀请码管理页面（/admin/invites）, THE Platform SHALL 支持生成、查看和撤销邀请码
4. WHEN Admin 访问审计日志页面（/admin/audit）, THE Platform SHALL 展示审计日志列表，支持筛选和导出
5. IF 非 Admin 或非 Moderator 角色的用户尝试访问管理后台, THEN THE Platform SHALL 返回 403 错误并记录该访问尝试到 AuditLog
6. THE Platform SHALL 在管理后台提供板块管理功能，支持创建、编辑、排序和设置板块可见性

### 需求 18：合规文档

**用户故事：** 作为平台运营者，我希望平台提供完整的合规四件套文档，以便满足法律合规要求。

#### 验收标准

1. THE Platform SHALL 在注册流程中展示用户协议，要求用户勾选同意后方可完成注册
2. THE Platform SHALL 提供可访问的社区规范页面，明确禁止行为和处罚规则
3. THE Platform SHALL 提供隐私政策页面，说明数据收集范围、使用目的、存储期限和用户权利
4. THE Platform SHALL 提供免责声明页面，明确平台不组织/不指挥/不实施任何举报或对抗行动，不提供法律建议，心理交流区为非医疗性质的同伴支持
5. WHEN 合规文档内容更新, THE Platform SHALL 通知所有用户并要求重新确认

### 需求 19：安全与数据保护

**用户故事：** 作为平台运营者，我希望平台实施严格的安全措施和数据保护策略，以便保障用户信息安全。

#### 验收标准

1. THE Platform SHALL 对所有用户密码和敏感标识使用 bcrypt 或 argon2 进行哈希存储
2. THE Platform SHALL 对所有 HTTP 通信强制使用 HTTPS
3. THE Platform SHALL 对存储的 IP 地址进行单向哈希处理，不存储明文 IP
4. THE Platform SHALL 对超过 90 天未活跃的匿名会话数据执行自动清理
5. THE Platform SHALL 对超过 180 天的已关闭 Case 数据执行脱敏归档
6. THE Platform SHALL 实施 CSRF 保护、XSS 防护和 SQL 注入防护
7. IF 检测到同一账户在 5 分钟内从 3 个以上不同 IP 哈希登录, THEN THE Platform SHALL 临时锁定该账户并通知 Admin
8. THE Platform SHALL 对所有 API 响应移除服务器版本信息和调试头

### 需求 20：通知系统

**用户故事：** 作为注册用户，我希望收到与我相关的平台通知，以便及时了解互动和状态变更。

#### 验收标准

1. WHEN 用户的帖子收到评论, THE Platform SHALL 生成站内通知
2. WHEN 用户的举报被处理, THE Platform SHALL 生成站内通知告知处理结果
3. WHEN 用户的 DCR 准入申请或 Case 状态发生变更, THE Platform SHALL 生成站内通知
4. THE Platform SHALL 提供通知列表页面，支持标记已读和批量清除
5. WHEN 用户在心理交流区的倾诉请求被 Listener 领取, THE Platform SHALL 生成站内通知

### 需求 21：页面路由与信息架构

**用户故事：** 作为用户，我希望平台具有清晰的页面结构和导航，以便快速找到所需功能。

#### 验收标准

1. THE Platform SHALL 提供以下公开区页面：首页（/）、知识库（/kb）、公告（/announcements）
2. THE Platform SHALL 提供以下会员区页面：发帖（/post/new）、帖子列表（/posts）、帖子详情（/posts/[id]）、倾听匹配（/match）、工单列表（/cases）、工单详情（/cases/[id]）、个人设置（/settings/profile）、举报列表（/reports）、新手引导（/onboarding）
3. THE Platform SHALL 提供以下管理后台页面：用户管理（/admin/users）、审核队列（/admin/modqueue）、邀请码管理（/admin/invites）、审计日志（/admin/audit）
4. THE Platform SHALL 根据用户角色和权限动态显示导航菜单项，隐藏无权限访问的页面入口
5. WHILE User 未完成新手引导, THE Platform SHALL 在首次登录时自动重定向至新手引导页面（/onboarding）

### 需求 22：Docker 部署

**用户故事：** 作为开发者，我希望通过 Docker Compose 一键启动完整的开发环境，以便快速开始开发和测试。

#### 验收标准

1. THE Platform SHALL 提供 docker-compose.yml 文件，包含 web（Next.js 应用）、postgres（PostgreSQL 数据库）、redis（Redis 缓存）三个服务
2. THE Platform SHALL 提供 .env.example 文件，列出所有必需的环境变量及说明
3. WHEN 开发者执行 `docker compose up`, THE Platform SHALL 自动启动所有服务并完成数据库迁移
4. THE Platform SHALL 提供 README 文件，包含项目简介、环境要求、启动步骤和开发指南
5. WHEN 开发者执行 `pnpm install && pnpm dev`, THE Platform SHALL 在本地开发模式下正常启动（需外部 PostgreSQL 和 Redis）


### 需求 23：UI 总体设计规范

**用户故事：** 作为学生用户，我希望平台具有简洁、轻盈、卡片化的视觉风格，以便获得舒适的浏览体验。

#### 验收标准

1. THE Platform SHALL 采用卡片化布局风格，所有卡片组件使用统一圆角（2xl）、轻柔阴影（soft shadow）和充足留白（p-4 或 p-6）
2. THE Platform SHALL 基于 shadcn/ui 组件库构建所有 UI 组件，包括 Card、Badge、Avatar、Button、Tabs、Sheet、Dialog、DropdownMenu、Input、Textarea、Select、Combobox、Skeleton、Toast、Alert、Pagination
3. THE Platform SHALL 对帖子详情页内容区域设置最大宽度为 max-w-2xl，确保长文阅读舒适度
4. THE Platform SHALL 实现移动端优先的响应式布局，在移动端和 PC 端均可正常使用
5. WHEN 用户在移动端访问平台, THE Platform SHALL 优先展示移动端优化的交互体验（底部导航、触摸友好的按钮尺寸、滑动手势支持）
6. WHEN 用户在 PC 端（屏幕宽度 >= 1024px）访问平台, THE Platform SHALL 将底部导航替换为左侧栏或顶部 Tabs 导航

### 需求 24：暗色模式与无障碍

**用户故事：** 作为学生用户，我希望平台支持暗色模式和无障碍操作，以便在不同环境和需求下舒适使用。

#### 验收标准

1. THE Platform SHALL 提供深浅色主题切换功能，用户可在设置中手动切换 DarkMode
2. WHEN 用户切换主题模式, THE Platform SHALL 立即应用新主题配色，无需刷新页面
3. THE Platform SHALL 确保所有文本与背景的颜色对比度达到 WCAG 2.1 AA 级标准（普通文本对比度 >= 4.5:1，大文本对比度 >= 3:1）
4. THE Platform SHALL 确保所有交互元素可通过键盘 Tab 键聚焦和 Enter/Space 键操作
5. THE Platform SHALL 为所有图片和图标提供有意义的 alt 文本或 aria-label 属性
6. THE Platform SHALL 确保所有表单控件具有关联的 label 元素或 aria-labelledby 属性

### 需求 25：顶部栏组件

**用户故事：** 作为用户，我希望通过顶部栏快速访问搜索、发布和消息功能，以便高效使用平台核心功能。

#### 验收标准

1. THE TopBar SHALL 在页面顶部固定显示，包含以下元素：左侧 Logo 或返回按钮、中部搜索框、右侧发布按钮和消息铃铛图标
2. WHEN 用户处于非首页页面, THE TopBar SHALL 将左侧 Logo 替换为返回按钮，点击后返回上一页
3. WHEN 用户点击搜索框并输入关键词, THE Platform SHALL 导航至搜索结果页面（/search?q=关键词）
4. WHEN 用户点击消息铃铛图标, THE Platform SHALL 导航至通知页面（/messages）
5. WHEN 存在未读通知, THE TopBar SHALL 在消息铃铛图标上显示未读数量角标

### 需求 26：底部导航组件

**用户故事：** 作为移动端用户，我希望通过底部导航栏快速切换主要功能区域，以便便捷地浏览平台。

#### 验收标准

1. WHILE 用户在移动端（屏幕宽度 < 1024px）访问平台, THE BottomNav SHALL 在页面底部固定显示，包含五个入口：首页、发现、发布（凸起样式）、消息、我的
2. WHEN 用户点击 BottomNav 的"发布"按钮, THE Platform SHALL 导航至发布页面（/create）
3. THE BottomNav SHALL 高亮当前所在页面对应的导航项
4. WHILE 用户在 PC 端（屏幕宽度 >= 1024px）访问平台, THE Platform SHALL 隐藏 BottomNav，使用左侧栏或顶部 Tabs 替代
5. WHEN 存在未读通知, THE BottomNav SHALL 在"消息"图标上显示未读数量角标


### 需求 27：Feed 瀑布流

**用户故事：** 作为用户，我希望在首页以瀑布流卡片形式浏览帖子，以便快速发现感兴趣的内容。

#### 验收标准

1. THE Feed SHALL 在首页（/）以 WaterfallLayout 展示帖子卡片，PC 端（屏幕宽度 >= 768px）显示 2 列，移动端显示 1 列或 2 列紧凑布局
2. THE Feed SHALL 为每张帖子卡片展示以下信息：封面图、标题、摘要（截取前 60 字符）、作者头像与昵称、点赞数、标签列表和所属分区
3. THE Feed SHALL 支持无限滚动加载，每次加载 20 条帖子
4. WHILE 帖子数据加载中, THE Feed SHALL 展示 Skeleton 骨架屏占位动画
5. THE Feed SHALL 在首页提供"综合推荐"和"最新"两个 Tab 切换
6. WHEN 用户切换 Tab, THE Feed SHALL 重新加载对应排序的帖子列表
7. THE Feed SHALL 过滤心理交流区和 DCR 私密区的帖子，确保私密内容不在公开 Feed 中出现
8. WHEN 帖子列表为空, THE Feed SHALL 展示 EmptyState 组件，包含插画占位（简单 SVG）和行为引导按钮

### 需求 28：帖子详情页（沉浸式阅读）

**用户故事：** 作为用户，我希望在帖子详情页获得沉浸式阅读体验，以便专注于内容阅读和互动。

#### 验收标准

1. WHEN 用户打开帖子详情页（/post/[id]）, THE PostDetail SHALL 展示帖子完整内容，包含多图轮播区域、Markdown 渲染正文、作者信息卡（头像、昵称、发帖时间）
2. WHEN 帖子包含多张图片, THE PostDetail SHALL 以轮播组件展示图片，支持左右滑动切换和图片计数指示器
3. THE PostDetail SHALL 在页面底部固定显示操作栏，包含点赞、收藏、评论和分享按钮
4. WHEN 用户点击评论按钮, THE PostDetail SHALL 从底部滑出 CommentDrawer 评论面板
5. THE CommentDrawer SHALL 支持楼中楼两层嵌套回复展示
6. WHEN 帖子属于心理交流区或 DCR 私密区, THE PostDetail SHALL 在页面顶部显示 PrivacyBanner 隐私提示条
7. THE PostDetail SHALL 将正文内容区域限制在 max-w-2xl 宽度内，确保阅读舒适度

### 需求 29：发布页

**用户故事：** 作为用户，我希望通过发布页便捷地创建图文帖子，以便分享内容到社区。

#### 验收标准

1. THE CreatePage SHALL 提供以下输入区域：图片上传区、标题输入框（最大 30 字符）、正文编辑器（支持 Markdown）、分区选择器和标签选择器
2. THE CreatePage SHALL 支持图片拖拽上传、多选上传和预览功能，单篇帖子最多上传 9 张图片
3. WHEN 用户上传图片后, THE CreatePage SHALL 展示图片缩略图预览，支持拖拽排序和单张删除
4. WHEN 用户输入标题超过 30 字符, THE CreatePage SHALL 阻止继续输入并显示字符计数提示
5. WHEN 用户在私密区（心理区或 DCR 区）发帖, THE CreatePage SHALL 展示"可见范围"选择器，要求用户先选择帖子可见范围
6. WHEN 用户点击发布按钮, THE CreatePage SHALL 对帖子内容执行敏感词预检，检测到敏感词时高亮标记并提示用户修改
7. IF 敏感词预检未通过, THEN THE CreatePage SHALL 阻止发布并在敏感词位置显示高亮标记和修改建议

### 需求 30：发现页

**用户故事：** 作为用户，我希望通过发现页探索热门话题和推荐内容，以便发现更多感兴趣的社区内容。

#### 验收标准

1. THE DiscoverPage SHALL 展示以下三个区域：热门话题网格卡片、热门板块横向滚动列表和每周栏目编辑推荐
2. THE DiscoverPage SHALL 以网格卡片形式展示热门话题标签，每张卡片包含话题名称和参与帖子数量
3. WHEN 用户点击话题卡片, THE Platform SHALL 导航至该话题的帖子列表页面
4. THE DiscoverPage SHALL 以横向滚动列表展示热门板块，每个板块卡片包含板块名称、描述和帖子数量
5. THE DiscoverPage SHALL 展示每周栏目编辑推荐区域，由 Admin 或 Moderator 手动配置推荐内容
6. WHEN 用户在发现页下拉刷新, THE Platform SHALL 重新加载热门话题和推荐内容


### 需求 31：搜索结果页

**用户故事：** 作为用户，我希望通过搜索快速找到帖子、用户和话题，以便高效获取所需信息。

#### 验收标准

1. WHEN 用户在搜索框输入关键词并提交, THE Platform SHALL 导航至搜索结果页面（/search?q=关键词），展示帖子、用户和话题三个分类的搜索结果
2. THE Platform SHALL 在搜索结果页提供"帖子"、"用户"、"话题"三个 Tab 切换
3. WHEN 搜索结果为空, THE Platform SHALL 展示 EmptyState 组件，包含"未找到相关内容"提示和搜索建议
4. THE Platform SHALL 对搜索结果进行分页展示，每页 20 条结果
5. THE Platform SHALL 在搜索结果中过滤用户无权限访问的私密区内容

### 需求 32：个人主页

**用户故事：** 作为用户，我希望查看自己和他人的个人主页，以便了解用户信息和发布内容。

#### 验收标准

1. THE Platform SHALL 在个人主页（/u/[id]）展示以下信息：用户头像、昵称、个人简介、加入时间
2. THE Platform SHALL 在个人主页提供"发帖"、"收藏"、"点赞"三个 Tab，分别展示用户的帖子列表、收藏列表和点赞列表
3. WHEN 用户查看自己的个人主页, THE Platform SHALL 展示所有三个 Tab 的完整内容
4. WHEN 用户查看他人的个人主页, THE Platform SHALL 仅展示"发帖"Tab 中的公开帖子，隐藏"收藏"和"点赞"Tab
5. THE Platform SHALL 在个人主页的帖子列表中以卡片形式展示帖子，包含封面图、标题和发布时间

### 需求 33：通知与消息页

**用户故事：** 作为用户，我希望在通知页面集中查看所有站内通知，以便及时了解互动和状态变更。

#### 验收标准

1. THE Platform SHALL 在通知页面（/messages）以时间倒序列表展示所有站内通知
2. THE Platform SHALL 对通知按类型分组展示：互动通知（评论、点赞）、系统通知（审核结果、状态变更）、私信通知（MVP 阶段可选）
3. WHEN 用户点击通知项, THE Platform SHALL 导航至对应的帖子详情页或工单详情页
4. WHEN 用户标记通知为已读, THE Platform SHALL 更新通知状态并移除未读角标计数
5. THE Platform SHALL 支持批量标记所有通知为已读

### 需求 34：版主管理后台简版

**用户故事：** 作为版主或管理员，我希望通过简版管理后台高效审核内容和管理社区，以便维护社区秩序。

#### 验收标准

1. THE ModerationDashboard SHALL 在管理后台页面（/moderation）以看板形式展示审核队列，包含"待审核"、"审核中"、"已通过"、"已拒绝"四个列
2. WHEN Moderator 点击审核队列中的内容卡片, THE ModerationDashboard SHALL 展示内容详情弹窗，包含帖子全文、作者信息、举报原因（如有）和审核操作按钮
3. THE ModerationDashboard SHALL 支持按内容类型（帖子、评论、举报）和板块进行筛选
4. WHEN Moderator 执行审核操作（批准/拒绝）, THE ModerationDashboard SHALL 立即更新看板状态并记录操作到 AuditLog
5. IF 非 Moderator 或非 Admin 角色的用户访问 /moderation, THEN THE Platform SHALL 返回 403 错误页面

### 需求 35：心理交流区 UI

**用户故事：** 作为心理交流区用户，我希望在安全、温暖的界面环境中匿名倾诉，以便获得情绪支持。

#### 验收标准

1. THE Platform SHALL 在心理交流区所有页面顶部始终显示安全提示条，内容为"这是一个安全的同伴支持空间。如需专业帮助，请联系可信成人或拨打心理援助热线"
2. WHEN 用户在心理交流区发帖, THE Platform SHALL 自动隐藏用户真实身份，使用随机生成的匿名标识和默认匿名头像
3. WHEN 帖子或评论内容包含风险触发词, THE Platform SHALL 弹出求助提示弹窗，展示紧急求助资源列表和一键拨打热线按钮
4. THE Platform SHALL 在心理交流区使用温暖柔和的配色方案（浅暖色调背景、圆润图标），与公开区视觉风格区分
5. THE Platform SHALL 在心理交流区入口页面（/apply）展示准入说明、倾听者守则摘要和申请按钮


### 需求 36：DCR 私密区 UI

**用户故事：** 作为 DCR 私密区用户，我希望通过清晰的界面完成工单提交和跟进，以便高效地获取信息互助。

#### 验收标准

1. THE Platform SHALL 在 DCR 入口页面（/dcr）展示私密区说明、准入要求、合规声明和申请入口按钮
2. THE Platform SHALL 在工单列表页面（/dcr/tickets）以卡片列表展示用户的工单，支持按状态（opened、inProgress、needMoreInfo、closed）筛选
3. THE Platform SHALL 在新建工单页面（/dcr/tickets/new）以多步表单（Wizard）引导用户完成工单创建，每步显示进度指示器
4. THE Platform SHALL 在工单详情页面（/dcr/tickets/[id]）以时间线组件展示工单的所有状态变更和跟进记录
5. WHILE User 的角色为 Admin, THE Platform SHALL 在工单详情页面显示"导出 CSV"按钮
6. WHILE User 的角色不为 Admin, THE Platform SHALL 隐藏工单详情页面的"导出 CSV"按钮
7. THE Platform SHALL 在 DCR 私密区所有页面顶部显示 PrivacyBanner，内容为"请勿在帖子中包含真实姓名、学校名称、教师姓名等可识别信息"

### 需求 37：页面路由与导航结构

**用户故事：** 作为用户，我希望平台具有完整的页面路由和清晰的导航结构，以便快速访问所有功能。

#### 验收标准

1. THE Platform SHALL 提供以下核心页面路由：首页 Feed（/）、发现页（/discover）、搜索结果页（/search?q=）、帖子详情页（/post/[id]）、发布页（/create）、个人主页（/u/[id]）、通知页（/messages）
2. THE Platform SHALL 提供以下管理与功能页面路由：版主管理后台（/moderation）、心理区申请页（/apply）、DCR 入口页（/dcr）、工单列表页（/dcr/tickets）、新建工单页（/dcr/tickets/new）、工单详情页（/dcr/tickets/[id]）、合规文档集合页（/help/policies）
3. THE Platform SHALL 根据用户角色和权限动态渲染导航菜单，隐藏用户无权限访问的页面入口
4. WHEN 用户访问无权限的页面路由, THE Platform SHALL 返回 403 错误页面
5. WHEN 用户访问不存在的页面路由, THE Platform SHALL 返回 404 错误页面
6. IF 服务器发生内部错误, THEN THE Platform SHALL 返回 500 错误页面，展示友好的错误提示和返回首页按钮

### 需求 38：列表空态与错误态

**用户故事：** 作为用户，我希望在列表无数据或页面出错时看到友好的提示，以便了解当前状态并获得操作引导。

#### 验收标准

1. WHEN 任何列表页面（帖子列表、通知列表、工单列表、搜索结果）数据为空, THE Platform SHALL 展示 EmptyState 组件，包含简单 SVG 插画占位和行为引导按钮（如"去发帖"、"去发现"）
2. THE Platform SHALL 提供独立的 404 错误页面，包含"页面未找到"提示、插画和返回首页按钮
3. THE Platform SHALL 提供独立的 403 错误页面，包含"无权限访问"提示、插画和返回首页按钮
4. THE Platform SHALL 提供独立的 500 错误页面，包含"服务器错误"提示、插画和重试按钮
5. WHEN 网络请求失败, THE Platform SHALL 展示 Toast 提示，内容为具体的错误信息和重试选项

### 需求 39：交互细节与微交互

**用户故事：** 作为用户，我希望平台具有流畅的交互细节，以便获得愉悦的使用体验。

#### 验收标准

1. WHEN 用户点击深浅色切换按钮, THE Platform SHALL 以平滑过渡动画切换主题配色，过渡时间不超过 300 毫秒
2. WHEN 用户在移动端使用平台, THE Platform SHALL 确保所有可点击元素的最小触摸区域为 44x44 像素
3. WHEN 用户在发帖向导中输入内容命中敏感词, THE CreatePage SHALL 以高亮背景色标记命中的敏感词文本，并在标记旁显示修改提示
4. WHEN Moderator 在审核看板中拖拽内容卡片, THE ModerationDashboard SHALL 以拖拽动画反馈卡片移动，并在释放后更新审核状态
5. WHEN 帖子详情页加载图片, THE PostDetail SHALL 以渐进式加载方式展示图片（先显示模糊缩略图，加载完成后显示清晰图片）
6. THE Platform SHALL 对所有按钮点击提供视觉反馈（按下态缩放或颜色变化），反馈延迟不超过 100 毫秒