# 需求文档：DCR 互助任务闭环系统

## 简介

在现有 DCR 四步互助流程（委托表 → 审核 → 考核 → 加入互助队伍）基础上，新增完整的"互助任务/工单"闭环功能。覆盖：A 发起求助 → B 接单私聊 → 证据区归档 → 结案。涉及状态机、数据模型、API、前端 UI、权限与风控、审计日志。

## 术语表

- **MutualAidTask**：互助任务，由求助者 A 在 DCR 私密区创建的结构化求助工单
- **HelpSession**：互助会话，B 领取任务后生成的会话记录，关联 A、B 和任务
- **HelpChat**：私聊通道，仅 A、B、平台管理可见的消息通道
- **EvidenceRoom**：证据空间，每个 HelpSession 对应一个证据归档区域
- **EvidenceItem**：证据条目，EvidenceRoom 中的单个条目（截图/录音/文件/文字/结果/回访）
- **TaskStatus**：任务状态枚举，定义任务生命周期的所有状态
- **CompletionReport**：结案报告，系统自动生成的互助完成摘要
- **ModerationAction**：管理处置记录，记录所有管理员/版主的处置操作

## 需求

### 需求 1：互助任务创建

**用户故事：** 作为 DCR 私密区用户（A），我希望创建结构化的互助求助任务，以便其他互助者能够了解我的需求并提供帮助。

#### 验收标准

1. WHEN 用户拥有 dcrAccess=true 时, THE MutualAidTask 系统 SHALL 允许用户在 DCR 私密区创建互助任务
2. THE MutualAidTask SHALL 包含以下必填字段：title（标题）、category（DCRCategory 分类）、summary（摘要）、expected_help_type（期望帮助类型）、urgency_level（紧急程度：LOW/MEDIUM/HIGH/URGENT）
3. THE MutualAidTask SHALL 包含 structured_fields（JSON）字段，支持：时间范围（date_range）、地点粒度（location_granularity：CITY/DISTRICT）、涉及类型（help_category：POLICY_CONSULT/COMMUNICATION_TEMPLATE/MATERIAL_PREP/OTHER）
4. THE MutualAidTask SHALL 支持可选的 attachments（附件），所有附件上传后默认进入待审状态（PENDING_REVIEW）
5. THE MutualAidTask SHALL 支持 risk_flags（JSON 数组）字段，用于系统自动标记或人工标记风险
6. WHEN 任务创建时, THE MutualAidTask 系统 SHALL 将任务初始状态设为 DRAFT
7. WHEN 用户提交草稿任务时, THE MutualAidTask 系统 SHALL 将状态从 DRAFT 变更为 SUBMITTED

### 需求 2：任务状态机

**用户故事：** 作为系统，我需要通过严格的状态机管理互助任务的生命周期，确保流程规范可控。

#### 验收标准

1. THE TaskStatus 枚举 SHALL 包含以下状态：DRAFT、SUBMITTED、UNDER_REVIEW、OPEN、CLAIMED、IN_PROGRESS、EVIDENCE_PENDING、COMPLETED、REJECTED、CLOSED、DISPUTED
2. THE MutualAidTask 系统 SHALL 仅允许以下正向状态转移：DRAFT→SUBMITTED、SUBMITTED→UNDER_REVIEW、UNDER_REVIEW→OPEN、OPEN→CLAIMED、CLAIMED→IN_PROGRESS、IN_PROGRESS→EVIDENCE_PENDING、EVIDENCE_PENDING→COMPLETED
3. THE MutualAidTask 系统 SHALL 允许从任意状态转移到 REJECTED、CLOSED、DISPUTED（管理员/系统操作）
4. WHEN 任务状态为 SUBMITTED 时, THE MutualAidTask 系统 SHALL 要求 Moderator 审核后方可转移到 UNDER_REVIEW 再到 OPEN
5. WHEN 任务状态为 OPEN 时, THE MutualAidTask 系统 SHALL 仅允许一个用户领取（同一时间仅一个主领取者），领取后状态变为 CLAIMED
6. WHEN 任务状态变为 CLAIMED 时, THE MutualAidTask 系统 SHALL 自动创建 HelpSession、HelpChat 和 EvidenceRoom
7. WHEN 任务进入 EVIDENCE_PENDING 时, THE MutualAidTask 系统 SHALL 要求双方确认或 Moderator 强制结案方可转移到 COMPLETED
8. WHEN 任务进入 DISPUTED 时, THE MutualAidTask 系统 SHALL 进入仲裁流程，双方提交说明，Moderator 处理
9. WHEN 任何状态转移发生时, THE MutualAidTask 系统 SHALL 在 timeline 中记录转移事件（旧状态、新状态、操作者、时间、原因）

### 需求 3：领取与私聊（HelpChat）

**用户故事：** 作为互助者（B），我希望领取求助任务并通过私聊与求助者沟通，以便高效提供帮助。

#### 验收标准

1. WHEN B 点击【接下互助】时, THE MutualAidTask 系统 SHALL 创建 HelpSession 记录（task_id、helper_id、requester_id、created_at）
2. WHEN HelpSession 创建时, THE MutualAidTask 系统 SHALL 同时创建 HelpChat 通道，仅 A、B、Moderator/Admin 可见
3. THE HelpChat SHALL 在首条消息位置显示系统提示："请注意保护隐私，不要发送实名、手机号、精确学校地址等敏感信息"
4. THE HelpChat SHALL 支持发送文本消息和引用回复（quote reply）
5. THE HelpChat SHALL 支持上传文件，上传的文件自动同步一份到对应的 EvidenceRoom
6. THE HelpChat SHALL 支持将任意消息"标记为证据候选"，标记后该消息内容同步到 EvidenceRoom 作为 NOTE 类型条目
7. WHEN 非 A、B、Moderator/Admin 用户尝试访问 HelpChat 时, THE MutualAidTask 系统 SHALL 返回 403 禁止访问

### 需求 4：证据空间（EvidenceRoom）

**用户故事：** 作为互助参与方，我希望在证据空间中归档互助过程的关键证据和结果，以便结案时有据可查。

#### 验收标准

1. WHEN HelpSession 创建时, THE MutualAidTask 系统 SHALL 自动创建对应的 EvidenceRoom
2. THE EvidenceRoom 可见性 SHALL 限制为仅 A、B、Moderator/Admin
3. THE EvidenceRoom SHALL 支持四种条目类型：EVIDENCE_ITEM（截图/录音/文件）、NOTE（文字说明）、OUTCOME（处理结果/回复内容）、FOLLOW_UP（回访录音/回访总结）
4. WHEN 用户上传文件到 EvidenceRoom 时, THE MutualAidTask 系统 SHALL 先显示"敏感信息提示"并要求用户勾选确认后方可上传
5. THE MutualAidTask 系统 SHALL 对上传文件的文件名和描述执行敏感词检测，检测到高风险词时阻止上传并提示用户
6. THE MutualAidTask 系统 SHALL 通过对象存储抽象层存储文件（MVP 使用本地存储或 MinIO），并生成短期签名 URL 供访问
7. WHEN 任何用户访问、下载或导出 EvidenceRoom 内容时, THE MutualAidTask 系统 SHALL 写入 audit_logs（操作者、时间、操作类型、对象 ID）
8. WHEN 非 A、B、Moderator/Admin 用户尝试访问 EvidenceRoom 时, THE MutualAidTask 系统 SHALL 返回 403 禁止访问

### 需求 5：结案与计次

**用户故事：** 作为互助参与方，我希望在互助完成后通过双方确认结案，系统自动生成结案报告并更新信誉积分。

#### 验收标准

1. WHEN A 点击【确认完成】或 B 点击【申请结案】时, THE MutualAidTask 系统 SHALL 将任务状态变更为 EVIDENCE_PENDING 并通知另一方确认
2. WHEN 另一方确认后, THE MutualAidTask 系统 SHALL 将任务状态变更为 COMPLETED
3. WHEN 一方长时间（超过 7 天）未确认时, THE MutualAidTask 系统 SHALL 允许 Moderator 强制结案并记录强制结案原因
4. WHEN 任务进入 COMPLETED 状态时, THE MutualAidTask 系统 SHALL 验证 EvidenceRoom 至少包含 1 个过程证据（EVIDENCE_ITEM 或 NOTE）和 1 个结果/回访条目（OUTCOME 或 FOLLOW_UP）
5. WHEN 任务成功完成时, THE MutualAidTask 系统 SHALL 生成 completion_report（摘要、时间线、条目列表、脱敏说明）
6. WHEN B 成功完成一次互助时, THE MutualAidTask 系统 SHALL 增加 B 的 reputationScore（+10 分）
7. WHEN 任务被标记为 DISPUTED 或 B 存在违规时, THE MutualAidTask 系统 SHALL 扣减 B 的 reputationScore（-20 分）
8. WHEN A 被判定为频繁恶意求助或骚扰时, THE MutualAidTask 系统 SHALL 扣减 A 的 reputationScore（-15 分）

### 需求 6：风控与治理

**用户故事：** 作为平台管理者，我需要对互助任务全流程实施风控措施，防止滥用和违规行为。

#### 验收标准

1. THE MutualAidTask 系统 SHALL 对任务发布、领取、私聊发送、证据上传操作实施频率限制（rate limit）
2. THE MutualAidTask 系统 SHALL 对任务标题、摘要、私聊内容、证据描述执行关键词检测，包含"动员""煽动""对抗""规避监管"等高风险词时触发强制审核或冻结
3. THE MutualAidTask 系统 SHALL 在 Task、HelpChat 消息、EvidenceItem 上提供举报入口
4. WHEN 任务进入 DISPUTED 状态时, THE MutualAidTask 系统 SHALL 要求双方提交争议说明
5. WHEN Moderator 处理争议时, THE MutualAidTask 系统 SHALL 支持以下操作：下架内容、更换互助者、封禁用户、驳回争议
6. WHEN 任何管理处置操作发生时, THE MutualAidTask 系统 SHALL 将操作记录写入 moderation_actions 表（操作者、操作类型、目标对象、原因、时间）

### 需求 7：互助任务信息流 UI

**用户故事：** 作为 DCR 私密区用户，我希望在首页以信息流形式浏览互助任务，快速找到需要帮助的任务或发起求助。

#### 验收标准

1. THE DCR 私密区首页 SHALL 在顶部显示 tabs 切换：推荐/最新/紧急
2. THE 信息流 SHALL 以卡片形式展示互助任务，每张卡片包含：title、标签（category）、紧急度标识、当前状态、是否可领取
3. THE 任务卡片 SHALL 提供两个 CTA 按钮：【查看详情】和【接下互助】（仅 OPEN 状态任务显示）
4. THE 信息流 SHALL 支持下拉刷新和滚动加载更多（分页）

### 需求 8：任务详情页 UI

**用户故事：** 作为用户，我希望在任务详情页查看完整的任务信息、状态时间线和可用操作。

#### 验收标准

1. THE 任务详情页 SHALL 展示结构化字段区（标题、分类、摘要、帮助类型、紧急度、时间范围、地点粒度、涉及类型）
2. THE 任务详情页 SHALL 展示风险提示区（如有 risk_flags 则显示警告信息）
3. THE 任务详情页 SHALL 展示状态时间线（Submitted → Reviewed → Claimed → In Progress → Evidence → Completed）
4. THE 任务详情页 SHALL 根据当前用户角色和任务状态显示对应 CTA：申请进入/领取/私聊/进入证据区/申请结案/确认完成
5. THE 任务详情页 SHALL 提供举报按钮

### 需求 9：HelpChat 页面 UI

**用户故事：** 作为互助参与方，我希望在私聊页面高效沟通并方便地将关键信息同步到证据区。

#### 验收标准

1. THE HelpChat 页面 SHALL 在顶部显示任务摘要信息
2. THE HelpChat 页面 SHALL 提供快捷按钮【上传到证据区】和【标记为证据】
3. THE HelpChat 页面 SHALL 支持消息引用回复
4. THE HelpChat 页面 SHALL 在首条位置显示隐私保护系统提示

### 需求 10：EvidenceRoom 页面 UI

**用户故事：** 作为互助参与方或管理员，我希望在证据空间页面分类查看和管理证据条目。

#### 验收标准

1. THE EvidenceRoom 页面 SHALL 分三栏展示：过程证据（EVIDENCE_ITEM）/ 结果与回访（OUTCOME + FOLLOW_UP）/ 备注（NOTE）
2. THE EvidenceRoom 页面 SHALL 在每栏提供上传按钮和条目列表
3. THE EvidenceRoom 页面 SHALL 对 Moderator/Admin 显示审计提示（下载记录可见）
4. THE EvidenceRoom 页面 SHALL 在上传前显示敏感信息确认对话框

### 需求 11：管理后台扩展

**用户故事：** 作为管理员，我需要在后台审核互助任务、处理争议和导出证据。

#### 验收标准

1. THE 管理后台 SHALL 新增"任务审核队列"页面，展示所有 SUBMITTED/UNDER_REVIEW 状态的任务
2. THE 管理后台 SHALL 新增"争议队列"页面，展示所有 DISPUTED 状态的任务及双方说明
3. THE 管理后台 SHALL 支持证据导出功能，导出前显示脱敏提示确认
4. THE 管理后台 SHALL 在任务审核时支持通过/拒绝操作，拒绝时必须填写原因

