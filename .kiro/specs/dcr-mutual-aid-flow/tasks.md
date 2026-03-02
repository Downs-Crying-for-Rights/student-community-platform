# 实施计划：DCR 四步互助流程改造

## 概述

将 DCR 互助系统从「准入申请 → 工单创建」两步流程重构为「填写委托表 → 审核 → 考核 → 加入互助队伍」四步互助线。实施顺序：先完成 Prisma 迁移和静态数据/纯函数层，再实现 API 路由，最后构建前端页面并集成。使用 TypeScript，测试框架为 vitest + fast-check。

## Tasks

- [x] 1. Prisma Schema 迁移与枚举扩展
  - [x] 1.1 在 `prisma/schema.prisma` 的 `DCRCategory` 枚举中新增 `EARLY_START`、`NO_WEEKENDS`、`EXTERNAL_TRAINING` 三个值
    - 保持现有值 TUTORING、FEES、WEEKENDS、OTHER 不变
    - 生成并应用 Prisma 迁移文件
    - _Requirements: 10.1, 10.2_

  - [x] 1.2 更新 `src/lib/validators.ts` 中的 `dcrCategorySchema`，在 z.enum 中新增三个类别值
    - 同步更新 `src/app/dcr/tickets/new/page.tsx` 中的 `DCR_CATEGORIES` 常量和 `CATEGORY_META` 映射
    - _Requirements: 10.3, 10.4_

- [x] 2. 静态数据与纯函数模块
  - [x] 2.1 创建 `src/lib/dcr-delegation-types.ts`，定义委托表相关类型和常量
    - 定义 `DelegationFormData` 接口
    - 定义 `CONTENT_TYPE_MAP`（内容类型 → DCRCategory 映射）
    - 定义 `SCHOOL_TYPE_OPTIONS`（学校性质 → 学校类型选项映射）
    - 定义 `DEMAND_OPTIONS`（诉求选项列表）
    - 定义 `DESCRIPTION_TEMPLATES`（描述模板映射）
    - 实现 `formatDelegation(data: DelegationFormData): string` 纯函数
    - _Requirements: 2.5, 2.9, 2.10, 2.11, 4.3_

  - [x] 2.2 创建 `src/lib/dcr-quiz-data.ts`，定义考核题库
    - 定义 `QuizQuestion` 接口（id, text, options, correctKey, explanation）
    - 定义 `QUIZ_QUESTIONS` 题库数组（10+ 道题）
    - 实现 `pickRandomQuestions(count: number): QuizQuestion[]` 纯函数（随机抽取不重复题目）
    - 实现 `gradeQuiz(questions: QuizQuestion[], answers: Array<{questionId: string; selectedKey: string}>): {passed: boolean; score: number; total: number; corrections: ...}` 纯函数
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6_

  - [x] 2.3 创建 `src/lib/dcr-flow-helpers.ts`，定义流程状态计算纯函数
    - 定义 `FlowState` 接口
    - 实现 `computeFlowStep(caseStatus, quizPassed, dcrAccess): 1|2|3|4` 纯函数
    - 无 Case 或 Case 为 CLOSED → 步骤 1；Case 为 OPENED → 步骤 2；Case 为 IN_PROGRESS 且 quizPassed=false → 步骤 3；quizPassed=true → 步骤 4
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 5.3_

  - [x] 2.4 在 `src/lib/validators.ts` 中新增 `delegationFormSchema` 和 `quizAnswerSchema` zod 校验
    - `delegationFormSchema`：按设计文档定义所有字段校验规则（contentType、schoolName、schoolCategory、schoolType、schoolAddress、reportChannels、description min 20、feeStatus、feeDetails、demands min 1、otherDemand、confirmations 三个 true）
    - `quizAnswerSchema`：answers 数组长度恰好为 5，每项含 questionId 和 selectedKey
    - _Requirements: 2.7, 2.14, 7.3_


  - [ ]* 2.5 编写委托表纯函数属性测试 `src/lib/__tests__/dcr-delegation.property.test.ts`
    - **Property 2: 学校类型选项依赖学校性质**
    - **Validates: Requirements 2.5**
    - **Property 3: 描述字段最小长度校验**
    - **Validates: Requirements 2.7**
    - **Property 4: 确认复选框全选校验**
    - **Validates: Requirements 2.14**
    - **Property 6: 格式化输出包含所有必填字段**
    - **Validates: Requirements 4.3**
    - **Property 12: 内容类型到 DCRCategory 映射正确性**
    - **Validates: Requirements 10.3**

  - [ ]* 2.6 编写流程状态计算属性测试 `src/lib/__tests__/dcr-flow.property.test.ts`
    - **Property 1: 流程状态计算正确性**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 5.3**

  - [ ]* 2.7 编写考核评分纯函数属性测试（追加到 `src/lib/__tests__/dcr-flow.property.test.ts`）
    - **Property 10: 考核评分正确性**
    - **Validates: Requirements 7.2, 7.4, 7.5**

- [x] 3. Checkpoint — 确保纯函数和静态数据模块测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 4. 实现考核 API 路由
  - [x] 4.1 创建 `src/app/api/dcr/quiz/route.ts`，实现 GET 和 POST handler
    - GET：使用 `withAuth` 中间件，查询用户是否有 IN_PROGRESS 状态的 Case 且 quizPassed=false；满足条件时调用 `pickRandomQuestions(5)` 返回题目（不含 correctKey）；quizPassed=true 返回 409；无审核通过 Case 返回 403
    - POST：使用 `withAuth` 中间件，zod 校验 `quizAnswerSchema`，调用 `gradeQuiz` 评分；通过时更新 `user.quizPassed = true`；返回评分结果
    - _Requirements: 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.4, 8.5_

  - [ ]* 4.2 编写考核 API 属性测试 `src/app/api/dcr/__tests__/quiz.property.test.ts`
    - **Property 8: 考核页面访问控制**
    - **Validates: Requirements 6.2, 6.3, 8.2, 8.5**
    - **Property 9: 考核题目选取正确性**
    - **Validates: Requirements 7.1, 7.6, 8.1**

  - [ ]* 4.3 编写考核 API 单元测试 `src/app/api/dcr/__tests__/quiz.test.ts`
    - 测试 GET 正常返回 5 道题目
    - 测试 GET 已通过考核返回 409
    - 测试 GET 无审核通过 Case 返回 403
    - 测试 POST 全部答对通过
    - 测试 POST 答错过多未通过并返回 corrections
    - _Requirements: 7.1, 7.2, 7.4, 8.1, 8.2, 8.4, 8.5_

- [x] 5. 实现加入互助队伍 API 路由
  - [x] 5.1 创建 `src/app/api/dcr/join/route.ts`，实现 POST handler
    - 使用 `withAuth` 中间件
    - 检查 quizPassed=true，否则返回 403
    - 检查 dcrAccess=false，否则返回 409
    - 更新 `user.dcrAccess = true`，记录审计日志
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 5.2 编写加入 API 属性测试 `src/app/api/dcr/__tests__/join.property.test.ts`
    - **Property 11: 加入互助队伍端点守卫**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

  - [ ]* 5.3 编写加入 API 单元测试 `src/app/api/dcr/__tests__/join.test.ts`
    - 测试正常加入成功
    - 测试未通过考核返回 403
    - 测试已加入返回 409
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 6. Checkpoint — 确保所有 API 路由测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 7. 改造 DCR 入口页四步流程展示
  - [x] 7.1 改造 `src/app/dcr/page.tsx`，替换现有准入申请逻辑为四步流程展示
    - 调用 API 获取用户当前 Case 状态、quizPassed、dcrAccess
    - 使用 `computeFlowStep` 计算当前步骤
    - 复用 `WizardStepper` 组件展示四步进度（填写委托表 → 审核 → 考核 → 加入互助队伍）
    - 每步卡片包含编号、标题、描述和操作按钮（跳转到对应页面或显示等待状态）
    - 被拒绝时显示拒绝原因和重新提交按钮
    - 已加入互助队伍时显示进入互助区入口
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.3_

  - [ ]* 7.2 编写入口页单元测试 `src/app/dcr/__tests__/dcr-flow-page.test.ts`
    - 测试四步进度条渲染
    - 测试各步骤状态下的按钮和提示文案
    - 测试被拒绝状态显示拒绝原因
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 8. 实现委托表页面
  - [x] 8.1 创建 `src/app/dcr/delegate/page.tsx`，实现委托表表单
    - 使用 React Hook Form + zod（`delegationFormSchema`）校验
    - 表单分 7 个区块：内容类型（RadioGroup）、学校信息（名称/性质/类型/地址）、举报途径（Textarea）、详细描述（Textarea + 可展开模板面板）、补课收费情况（RadioGroup + 条件输入）、诉求（Checkbox group + 条件输入）、确认信息（3 个必选 Checkbox）
    - 学校类型选项根据学校性质动态变化（使用 `SCHOOL_TYPE_OPTIONS`）
    - 描述模板面板使用 `DESCRIPTION_TEMPLATES`
    - 提交前调用 `scanContent` 检测敏感信息，检测到时使用 `SensitiveHighlight` 高亮并阻止提交
    - 提交调用 `POST /api/cases`，传递 category（通过 `CONTENT_TYPE_MAP` 映射）、formData、pledgeText
    - 顶部显示 `PrivacyBanner`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 3.3, 3.4, 3.5, 4.1, 5.1_

  - [ ]* 8.2 编写委托表页面单元测试 `src/app/dcr/delegate/__tests__/delegate-page.test.ts`
    - 测试表单渲染所有 7 个区块
    - 测试学校类型选项随学校性质变化
    - 测试描述模板面板展开/折叠
    - 测试确认复选框未全选时提交按钮禁用
    - 测试敏感信息检测阻止提交
    - _Requirements: 2.5, 2.7, 2.10, 2.14, 3.3, 3.4_

  - [ ]* 8.3 编写委托表敏感内容属性测试（追加到 `src/lib/__tests__/dcr-delegation.property.test.ts`）
    - **Property 5: 敏感内容阻止提交**
    - **Validates: Requirements 3.3, 3.4, 3.5**

- [x] 9. 实现考核页面
  - [x] 9.1 创建 `src/app/dcr/quiz/page.tsx`，实现考核页面
    - 分两个阶段：教程阶段和答题阶段
    - 教程阶段：多章节内容展示，滚动阅读进度追踪，完成所有章节后解锁答题按钮
    - 答题阶段：调用 `GET /api/dcr/quiz` 获取 5 道单选题，用户逐题作答，提交调用 `POST /api/dcr/quiz`
    - 通过时显示成功提示和「加入互助队伍」按钮（调用 `POST /api/dcr/join`）
    - 未通过时显示错题解析和重新答题按钮
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.3, 8.4, 9.1_

  - [ ]* 9.2 编写考核页面单元测试 `src/app/dcr/quiz/__tests__/quiz-page.test.ts`
    - 测试教程阶段渲染和进度追踪
    - 测试答题阶段题目渲染和选择交互
    - 测试通过/未通过结果展示
    - 测试加入互助队伍按钮调用
    - _Requirements: 6.1, 6.4, 7.1, 7.4, 8.3, 9.1_

- [x] 10. 集成与委托表提交 Case 创建
  - [x] 10.1 确保委托表提交通过 `POST /api/cases` 创建 OPENED 状态 Case，formData 存储完整委托表数据
    - 验证 round-trip：提交数据与 Case.formData 一致
    - 验证 Case.category 使用 `CONTENT_TYPE_MAP` 映射后的 DCRCategory 值
    - _Requirements: 4.1, 4.2, 5.1_

  - [ ]* 10.2 编写委托表提交属性测试 `src/app/api/dcr/__tests__/delegation.property.test.ts`
    - **Property 7: 委托表提交创建 OPENED 状态 Case**
    - **Validates: Requirements 4.1, 5.1**

- [x] 11. 最终 Checkpoint — 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户确认。

## Notes

- 标记 `*` 的任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- Checkpoint 任务确保增量验证
- 属性测试验证通用正确性属性（12 个 Property），单元测试验证具体示例和边界情况
- 所有 API 路由复用现有 `withAuth` 中间件和 zod 校验模式
- 前端组件使用 `"use client"` + React Hook Form + shadcn/ui
- 委托表数据存储在现有 `Case.formData` JSON 字段中，无需新增数据表
