# Bugfix 需求文档

## 简介

DCR 工单系统存在多个关联 Bug，涵盖工单可见性、流程透明度、沟通机制、帖子可见性和多人互助支持。这些问题导致用户在使用 DCR 互助系统时体验不佳：工单创建后列表不显示、流程步骤不清晰、沟通方式复杂、帖子对所有 DCR 用户可见（而非仅互助双方）、且不支持多人参与同一工单的互助。

## Bug 分析

### 当前行为（缺陷）

**Bug 1: 工单发布与审核不显示**

1.1 WHEN 用户通过 `/dcr/tickets/new` 创建工单后访问 `/dcr/tickets` 列表页 THEN 工单列表页标题为"我的工单"，但 GET /api/cases 的 OR 条件（`handlerId=userId | status=OPENED | submitterId=userId`）在 status 筛选参数与 OR 条件组合时可能导致查询结果不符合预期（例如筛选 `status=IN_PROGRESS` 时，OR 条件中的 `status: "OPENED"` 子句与外层 status 筛选冲突）

1.2 WHEN 用户完成四步准入流程后进入工单系统 THEN 系统没有区分"准入审核"（AccessApplication 审核）和"工单处理"（Case 状态流转），用户误以为工单需要"审核"才能显示，实际上工单创建后即为 OPENED 状态，无需审核即可在列表中显示

**Bug 2: 工单整体流程不明确**

1.3 WHEN 用户完成四步准入流程（委托表→审核→考核→加入）后进入 `/dcr/tickets` THEN 系统没有提供任何引导说明工单系统的使用方式（新建→等待接单→处理→关闭），用户不清楚"准入流程"和"工单互助流程"是两个独立流程

1.4 WHEN 用户在 `/dcr/tickets` 页面查看工单列表 THEN 页面仅显示工单卡片列表，没有工单状态流转说明（OPENED→IN_PROGRESS→NEED_MORE_INFO→CLOSED），用户不理解各状态含义和下一步操作

1.5 WHEN DCR_HELPER 在 Helper 工作台 (`/dcr/helper`) 查看待接单工单 THEN 工作台与工单列表页 (`/dcr/tickets`) 之间没有明确的导航关联，侧边栏仅有一个"DCR 互助区"入口指向 `/dcr/tickets`，没有 Helper 工作台和 DCR 帖子的独立入口

**Bug 3: 双方沟通过于复杂**

1.6 WHEN 工单状态为 IN_PROGRESS 或 NEED_MORE_INFO 时提交者和处理者通过 MessagePanel 沟通 THEN 消息系统仅支持一对一（senderId→receiverId），Message 模型的 receiverId 为单一字段，无法支持多人参与的消息通道

1.7 WHEN 用户发送消息后等待对方回复 THEN 系统没有实时通知机制（无 WebSocket/SSE），用户需要手动刷新页面才能看到新消息，沟通效率低

1.8 WHEN 工单状态为 OPENED 时 THEN MessagePanel 的 `canSendMessage()` 函数返回 false，提交者无法在等待接单期间补充信息或与潜在处理者沟通

**Bug 4: 工单广场帖子可见性问题**

1.9 WHEN 用户访问 `/dcr/posts` 页面 THEN 系统通过 `GET /api/posts?zone=DCR` 获取所有 zone=DCR 的帖子，对所有拥有 dcrAccess 的用户可见，而非仅对工单互助双方（提交者和处理者）可见

1.10 WHEN DCR 帖子被创建时 THEN Post 模型没有与 Case 模型的关联字段（无 caseId），无法将帖子与特定工单绑定，导致无法实现基于工单的帖子可见性控制

**Bug 5: 不支持多人互助**

1.11 WHEN 一个工单需要多人协助处理时 THEN Case 模型仅有单一 `handlerId` 字段（`String?`），只能指定一个处理者，无法支持多人参与同一工单的互助

1.12 WHEN 多个 DCR_HELPER 想要参与同一工单的互助时 THEN PATCH /api/cases/[id] 的接单逻辑（OPENED→IN_PROGRESS）直接将 `handlerId` 设为接单者 ID，后续其他人无法再加入该工单的处理

### 期望行为（正确）

**Bug 1 修复: 工单可见性**

2.1 WHEN 用户通过 `/dcr/tickets/new` 创建工单后访问 `/dcr/tickets` 列表页 THEN 系统 SHALL 确保 GET /api/cases 的查询逻辑在 status 筛选参数与 OR 条件组合时正确工作，用户始终能看到自己提交的工单（submitterId=userId）和自己处理的工单（handlerId=userId），无论筛选什么状态

2.2 WHEN 用户完成四步准入流程后进入工单系统 THEN 系统 SHALL 在 UI 上清晰区分"准入审核"（四步流程中的步骤2）和"工单处理流程"（OPENED→接单→处理→关闭），避免用户混淆

**Bug 2 修复: 流程透明度**

2.3 WHEN 用户首次进入 `/dcr/tickets` 页面 THEN 系统 SHALL 提供工单流程引导说明，解释工单的四个状态（待处理→处理中→待补充→已关闭）及各状态下用户可执行的操作

2.4 WHEN 用户在 `/dcr/tickets` 页面查看工单列表 THEN 系统 SHALL 在工单卡片或页面顶部展示工单状态流转图或说明文字，帮助用户理解当前工单所处阶段和下一步操作

2.5 WHEN 拥有 dcrAccess 的用户使用侧边栏导航 THEN 系统 SHALL 在侧边栏提供 DCR 子导航，包含"工单列表"、"Helper 工作台"（仅 DCR_HELPER/ADMIN 可见）和"DCR 帖子"的独立入口

**Bug 3 修复: 简化沟通**

2.6 WHEN 工单存在多个参与者（提交者 + 多个处理者）时 THEN 系统 SHALL 支持基于工单的群组消息通道，所有工单参与者都能在同一消息面板中查看和发送消息，而非仅限一对一

2.7 WHEN 工单有新消息时 THEN 系统 SHALL 通过轮询机制（如每 15 秒自动刷新）或页面可见性变化时自动刷新消息列表，减少用户手动刷新的需要

2.8 WHEN 工单状态为 OPENED 时 THEN 系统 SHALL 允许提交者在消息面板中补充信息（单向发送），以便潜在处理者在接单前了解更多上下文

**Bug 4 修复: 帖子可见性**

2.9 WHEN 用户访问 `/dcr/posts` 页面 THEN 系统 SHALL 仅显示与用户参与的工单关联的帖子（用户是该工单的提交者或处理者之一），而非所有 zone=DCR 的帖子

2.10 WHEN DCR 帖子被创建时 THEN 系统 SHALL 要求帖子关联到一个具体的 Case（通过 caseId 字段），帖子的可见性由关联工单的参与者决定

**Bug 5 修复: 多人互助**

2.11 WHEN 一个工单需要多人协助处理时 THEN 系统 SHALL 支持多个处理者加入同一工单，通过 CaseHandler 关联表（caseId + userId）替代单一 handlerId 字段

2.12 WHEN 一个 DCR_HELPER 想要加入已有处理者的工单时 THEN 系统 SHALL 允许在工单状态为 OPENED 或 IN_PROGRESS 时加入，每个工单最多允许 5 个处理者，且每个处理者的并发工单上限仍为 5 个

### 不变行为（回归防护）

3.1 WHEN 管理员（ADMIN/SUPER_ADMIN）访问 GET /api/cases THEN 系统 SHALL CONTINUE TO 返回所有工单，不受 OR 条件限制

3.2 WHEN 没有 dcrAccess 的用户访问 GET /api/cases THEN 系统 SHALL CONTINUE TO 仅返回该用户自己提交的工单（submitterId=userId）

3.3 WHEN 用户通过 `/dcr/tickets/new` 四步向导创建工单 THEN 系统 SHALL CONTINUE TO 执行类别选择→表单填写→隐私扫描→强制声明的完整流程，工单创建后状态为 OPENED

3.4 WHEN 工单状态变更时 THEN 系统 SHALL CONTINUE TO 遵循状态机规则（OPENED→IN_PROGRESS/CLOSED, IN_PROGRESS→NEED_MORE_INFO/CLOSED, NEED_MORE_INFO→IN_PROGRESS），并生成 TimelineEvent 记录和发送通知

3.5 WHEN 工单状态为 CLOSED 时 THEN 系统 SHALL CONTINUE TO 禁止发送消息（canSendMessage 返回 false）且不显示操作按钮

3.6 WHEN 用户访问工单详情页 `/dcr/tickets/[id]` THEN 系统 SHALL CONTINUE TO 执行权限检查（仅提交者、处理者、ADMIN 可访问），并记录审计日志

3.7 WHEN DCR_HELPER 接单时 THEN 系统 SHALL CONTINUE TO 检查并发处理上限（每人最多 5 个活跃工单），超出时返回错误

3.8 WHEN 消息发送时 THEN 系统 SHALL CONTINUE TO 设置 isAnonymous=true，保护用户隐私

3.9 WHEN 四步准入流程正常运行时 THEN 系统 SHALL CONTINUE TO 按照委托表→审核→考核→加入的顺序执行，computeFlowStep 函数的逻辑保持不变
