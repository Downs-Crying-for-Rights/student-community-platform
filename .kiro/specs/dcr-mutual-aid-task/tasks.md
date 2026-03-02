# 实施计划：DCR 互助任务闭环系统

## 概述

在现有 DCR 四步互助流程基础上，新增完整的互助任务闭环功能。实施顺序：Prisma 迁移 → 纯函数/类型 → API 路由 → 前端页面 → 管理后台。使用 TypeScript，测试框架为 vitest + fast-check。

## Tasks

- [x] 1. Prisma Schema 迁移
  - [x] 1.1 在 `prisma/schema.prisma` 中新增 `TaskStatus`、`UrgencyLevel`、`EvidenceItemType` 枚举
    - TaskStatus: DRAFT, SUBMITTED, UNDER_REVIEW, OPEN, CLAIMED, IN_PROGRESS, EVIDENCE_PENDING, COMPLETED, REJECTED, CLOSED, DISPUTED
    - UrgencyLevel: LOW, MEDIUM, HIGH, URGENT
    - EvidenceItemType: EVIDENCE_ITEM, NOTE, OUTCOME, FOLLOW_UP
    - _Requirements: 2.1_

  - [x] 1.2 在 `prisma/schema.prisma` 中新增 `MutualAidTask`、`TaskTimelineEvent`、`HelpSession`、`HelpChat`、`HelpChatMessage`、`EvidenceRoom`、`EvidenceItem`、`ModerationAction` 模型
    - 按设计文档定义所有字段、关联和索引
    - 在 User 模型中追加 `tasksRequested MutualAidTask[] @relation("TaskRequester")` 关联
    - 生成并应用 Prisma 迁移文件
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 3.1, 3.2, 4.1, 4.3, 6.6_

- [x] 2. 纯函数与类型模块
  - [x] 2.1 创建 `src/lib/task-state-machine.ts`，实现状态机纯函数
    - 定义 `TaskStatus` 类型和 `FORWARD_TRANSITIONS` 映射
    - 实现 `canTransition(from, to): boolean` 纯函数
    - 实现 `getNextStates(current): TaskStatus[]` 纯函数
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.2 创建 `src/lib/task-completion.ts`，实现结案验证纯函数
    - 实现 `checkCompletionRequirements(evidenceItems): CompletionCheck` 纯函数
    - 验证至少 1 个过程证据 + 1 个结果/回访条目
    - _Requirements: 5.4_

  - [x] 2.3 在 `src/lib/validators.ts` 中新增互助任务相关 zod schema
    - `createTaskSchema`、`taskActionSchema`、`sendChatMessageSchema`、`createEvidenceItemSchema`、`closeTaskSchema`、`disputeTaskSchema`、`moderateDisputeSchema`
    - _Requirements: 1.2, 1.3, 3.4, 4.3, 5.1, 6.4_

  - [ ]* 2.4 编写状态机属性测试 `src/lib/__tests__/task-state-machine.property.test.ts`
    - **Property 1: 状态机转移合法性**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 2.5 编写结案验证属性测试 `src/lib/__tests__/task-completion.property.test.ts`
    - **Property 6: 结案证据完整性**
    - **Validates: Requirements 5.4**

- [x] 3. Checkpoint — 确保纯函数模块正确
  - 运行 `npx vitest run src/lib/__tests__/task-state-machine` 和 `src/lib/__tests__/task-completion` 确保通过

- [x] 4. 任务 CRUD API
  - [x] 4.1 创建 `src/app/api/dcr/tasks/route.ts`，实现 POST（创建任务）和 GET（任务列表）
    - POST：withAuth + dcrAccess 检查，zod 校验 createTaskSchema，创建 DRAFT 状态任务，对标题和摘要执行敏感词检测
    - GET：withAuth + dcrAccess 检查，支持 tab 参数（recommended/latest/urgent），分页，仅返回 OPEN 及以上状态的任务
    - _Requirements: 1.1, 1.2, 1.6, 6.1, 6.2, 7.1, 7.2_

  - [x] 4.2 创建 `src/app/api/dcr/tasks/[id]/route.ts`，实现 GET（任务详情）和 PATCH（状态变更）
    - GET：withAuth，返回任务详情含 timeline
    - PATCH：withAuth，zod 校验 taskActionSchema，使用 canTransition 验证状态转移合法性，记录 timeline 事件
    - submit：仅任务创建者可操作，DRAFT→SUBMITTED
    - review：仅 Moderator/Admin，SUBMITTED→UNDER_REVIEW
    - approve：仅 Moderator/Admin，UNDER_REVIEW→OPEN
    - reject：仅 Moderator/Admin，任意→REJECTED，必须填写 reason
    - _Requirements: 1.7, 2.2, 2.3, 2.4, 2.9, 8.1, 8.2, 8.3_

  - [ ]* 4.3 编写任务 CRUD 单元测试 `src/app/api/dcr/tasks/__tests__/route.test.ts`
    - 测试创建任务、列表查询、状态变更、权限检查
    - _Requirements: 1.1, 1.2, 1.6, 1.7, 2.2, 2.4_

- [x] 5. 领取任务 API
  - [x] 5.1 创建 `src/app/api/dcr/tasks/[id]/claim/route.ts`，实现 POST handler
    - withAuth + dcrAccess 检查
    - 验证任务状态为 OPEN，使用 Prisma 事务确保互斥（乐观锁或 where 条件）
    - 在事务中：更新状态为 CLAIMED → 创建 HelpSession → 创建 HelpChat（含系统隐私提示消息）→ 创建 EvidenceRoom → 记录 timeline
    - 返回 sessionId、chatId、evidenceRoomId
    - _Requirements: 2.5, 2.6, 3.1, 3.2, 3.3, 4.1_

  - [ ]* 5.2 编写领取 API 单元测试 `src/app/api/dcr/tasks/__tests__/claim.test.ts`
    - 测试正常领取、重复领取 409、非 OPEN 状态 400、无权限 403
    - **Property 2: 领取互斥性**
    - **Property 3: CLAIMED 自动创建关联资源**
    - _Requirements: 2.5, 2.6, 3.1, 3.2, 4.1_

- [x] 6. HelpChat API
  - [x] 6.1 创建 `src/app/api/dcr/tasks/[id]/chat/route.ts`，实现 GET 和 POST
    - GET：withAuth，验证访问权限（A/B/Moderator/Admin），返回消息列表（分页）
    - POST：withAuth，验证访问权限，zod 校验 sendChatMessageSchema，敏感词检测，频率限制，创建消息
    - 如果消息包含 fileUrl，自动在 EvidenceRoom 创建 EVIDENCE_ITEM 条目
    - _Requirements: 3.2, 3.4, 3.5, 3.7, 6.1, 6.2_

  - [x] 6.2 创建 `src/app/api/dcr/tasks/[id]/chat/[msgId]/mark-evidence/route.ts`，实现 POST
    - withAuth，验证访问权限
    - 将消息标记为 isEvidence=true，同步创建 EvidenceRoom NOTE 条目
    - _Requirements: 3.6_

  - [ ]* 6.3 编写 HelpChat API 单元测试 `src/app/api/dcr/tasks/__tests__/chat.test.ts`
    - 测试消息发送、引用回复、访问控制、标记证据
    - **Property 4: HelpChat 访问控制**
    - _Requirements: 3.2, 3.4, 3.6, 3.7_

- [x] 7. EvidenceRoom API
  - [x] 7.1 创建 `src/app/api/dcr/tasks/[id]/evidence/route.ts`，实现 GET 和 POST
    - GET：withAuth，验证访问权限（A/B/Moderator/Admin），返回证据条目列表（按 type 分组），写入审计日志
    - POST：withAuth，验证访问权限，zod 校验 createEvidenceItemSchema（sensitiveConfirmed 必须为 true），对描述和文件名执行敏感词检测，创建条目，写入审计日志
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7, 4.8_

  - [x] 7.2 创建 `src/app/api/dcr/tasks/[id]/evidence/[itemId]/url/route.ts`，实现 GET
    - withAuth，验证访问权限，生成短期签名 URL，写入审计日志（下载操作）
    - _Requirements: 4.6, 4.7_

  - [ ]* 7.3 编写 EvidenceRoom API 单元测试 `src/app/api/dcr/tasks/__tests__/evidence.test.ts`
    - 测试条目创建、访问控制、敏感确认、审计日志
    - **Property 5: EvidenceRoom 访问控制**
    - **Property 9: 证据上传敏感确认**
    - **Property 10: 审计日志完整性**
    - _Requirements: 4.2, 4.4, 4.5, 4.7, 4.8_

- [x] 8. 结案与争议 API
  - [x] 8.1 创建 `src/app/api/dcr/tasks/[id]/close/route.ts`，实现 POST
    - withAuth，验证访问权限
    - action=request：A 或 B 发起，设置对应 confirmed 标志，如果任务在 IN_PROGRESS 则转为 EVIDENCE_PENDING
    - action=confirm：另一方确认，检查 checkCompletionRequirements，双方都确认后转为 COMPLETED，生成 completionReport，更新信誉积分
    - action=force：仅 Moderator/Admin，强制结案，记录原因
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 8.2 创建 `src/app/api/dcr/tasks/[id]/dispute/route.ts`，实现 POST
    - withAuth，验证为 A 或 B，zod 校验 disputeTaskSchema
    - 将任务状态转为 DISPUTED，记录争议说明，扣减违规方信誉
    - _Requirements: 2.8, 5.7, 6.4_

  - [x] 8.3 创建 `src/app/api/admin/disputes/route.ts`（GET）和 `src/app/api/admin/disputes/[id]/route.ts`（POST）
    - GET：Moderator/Admin 权限，返回 DISPUTED 状态任务列表
    - POST：zod 校验 moderateDisputeSchema，执行仲裁操作，写入 ModerationAction，更新任务状态
    - _Requirements: 6.5, 6.6, 11.2_

  - [ ]* 8.4 编写结案与争议 API 单元测试 `src/app/api/dcr/tasks/__tests__/close.test.ts`
    - 测试申请结案、确认完成、强制结案、证据不完整拒绝、争议流程
    - **Property 7: 双方确认结案**
    - **Property 8: 信誉积分变更正确性**
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_

- [x] 9. Checkpoint — 确保所有 API 路由正确
  - 运行所有 API 测试确保通过

- [x] 10. 互助任务信息流页面
  - [x] 10.1 创建 `src/app/dcr/tasks/page.tsx`，实现任务信息流
    - "use client"，顶部 Tabs（推荐/最新/紧急），卡片列表展示任务
    - 每张卡片：title、category Badge、urgencyLevel 标识、status、可领取时显示【接下互助】CTA
    - 支持滚动加载更多（分页）
    - 右上角【发起求助】按钮跳转到 /dcr/tasks/new
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 10.2 创建 `src/app/dcr/tasks/new/page.tsx`，实现创建任务表单
    - React Hook Form + zod（createTaskSchema）
    - 表单区块：标题、分类、摘要、期望帮助类型、紧急度、结构化字段（时间范围/地点粒度/涉及类型）
    - 提交前敏感词检测
    - 提交后跳转到任务详情页
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7_

- [x] 11. 任务详情页
  - [x] 11.1 创建 `src/app/dcr/tasks/[id]/page.tsx`，实现任务详情
    - 结构化字段展示区
    - 风险提示区（risk_flags）
    - 状态时间线（复用 TimelineView 组件模式）
    - 根据用户角色和任务状态显示 CTA 按钮
    - 举报按钮
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 12. HelpChat 页面
  - [x] 12.1 创建 `src/app/dcr/tasks/[id]/chat/page.tsx`，实现私聊页面
    - 顶部任务摘要信息
    - 消息列表（支持引用回复展示）
    - 快捷按钮【上传到证据区】【标记为证据】
    - 首条系统隐私提示消息
    - 消息输入框 + 发送按钮
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 13. EvidenceRoom 页面
  - [x] 13.1 创建 `src/app/dcr/tasks/[id]/evidence/page.tsx`，实现证据空间页面
    - 三栏布局：过程证据 / 结果与回访 / 备注
    - 每栏条目列表 + 上传按钮
    - 上传前敏感信息确认对话框
    - Moderator/Admin 可见审计提示
    - PrivacyBanner 顶部展示
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 14. 管理后台扩展
  - [x] 14.1 创建 `src/app/admin/tasks/page.tsx`，实现任务审核队列
    - 展示 SUBMITTED/UNDER_REVIEW 状态任务列表
    - 支持通过/拒绝操作，拒绝时弹窗填写原因
    - _Requirements: 11.1, 11.4_

  - [x] 14.2 创建 `src/app/admin/disputes/page.tsx`，实现争议队列
    - 展示 DISPUTED 状态任务及双方说明
    - 支持仲裁操作（下架/更换/封禁/驳回）
    - _Requirements: 11.2_

  - [x] 14.3 在管理后台添加证据导出功能
    - 导出前显示脱敏提示确认对话框
    - 导出写入审计日志
    - _Requirements: 11.3_

- [x] 15. 最终 Checkpoint — 确保所有测试通过
  - 运行全部测试确保通过，如有问题请向用户确认

## Notes

- 标记 `*` 的任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- Checkpoint 任务确保增量验证
- 所有 API 路由复用现有 `withAuth` 中间件、`enforceRateLimit`、`logAudit`、`scanContent` 模式
- 前端组件使用 `"use client"` + React Hook Form + shadcn/ui
- 文件存储复用现有 OSS 模块（`src/lib/oss.ts`），MVP 阶段可用本地存储
- 状态机逻辑抽取为纯函数，便于属性测试验证
