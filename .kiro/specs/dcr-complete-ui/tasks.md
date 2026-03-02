# 实施计划：DCR 互助系统完整 UI

## 概述

基于需求和设计文档，将 DCR 互助系统缺失的 UI 功能和后端路由拆分为增量式编码任务。每个任务构建在前一步之上，优先实现核心纯函数和 API 路由，再构建前端页面，最后集成联调。使用 TypeScript，测试框架为 vitest + fast-check。

## Tasks

- [x] 1. 实现纯函数与核心工具模块
  - [x] 1.1 创建 `src/lib/dcr-ui-helpers.ts`，实现以下纯函数：`getAvailableActions`、`canSendMessage`、`formatMessageTime`、`isOwnMessage`、`formatHelperCaseCount`
    - `getAvailableActions(status, role, isSubmitter, isHandler)` 返回 `ActionConfig[]`，按设计文档中的按钮映射表实现
    - `canSendMessage(status)` 仅在 IN_PROGRESS/NEED_MORE_INFO 时返回 true
    - `formatMessageTime(dateStr)` 返回 `MM-DD HH:mm` 格式
    - `isOwnMessage(senderId, currentUserId)` 判断消息归属
    - `formatHelperCaseCount(active, max)` 返回 `"N/5"` 格式
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.9, 2.1, 2.5, 2.6, 2.8, 2.9, 4.7_

  - [x] 1.2 创建 `src/lib/csv-helpers.ts`，实现以下纯函数：`escapeCsvField`、`sanitizeFormData`、`buildCsvRow`
    - `escapeCsvField(value)` 处理逗号、双引号、换行符的 RFC 4180 转义
    - `sanitizeFormData(formData, matches)` 将敏感词替换为 `[已脱敏]`
    - `buildCsvRow(caseData)` 构建 CSV 数据行，头行为 `id,category,status,formData,pledgeText,createdAt,submitterId`
    - _Requirements: 5.6, 5.7, 5.8_

  - [x] 1.3 编写 DCR UI 纯函数属性测试 `src/components/dcr/__tests__/dcr-ui.property.test.ts`
    - **Property 1: 操作按钮与状态/角色的映射正确性** — 验证 `getAvailableActions` 对所有状态/角色组合返回正确按钮集合
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.9**
    - **Property 2: 消息发送状态守卫** — 验证 `canSendMessage` 仅在 IN_PROGRESS/NEED_MORE_INFO 返回 true
    - **Validates: Requirements 2.1, 2.8**
    - **Property 3: 消息时间格式化** — 验证 `formatMessageTime` 输出匹配 `MM-DD HH:mm`
    - **Validates: Requirements 2.9**
    - **Property 4: 消息归属判断** — 验证 `isOwnMessage` 当且仅当 senderId === currentUserId 时返回 true
    - **Validates: Requirements 2.6**
    - **Property 11: Helper 工单计数格式** — 验证 `formatHelperCaseCount(N, 5)` 返回 `"N/5"`
    - **Validates: Requirements 4.7**

  - [x] 1.4 编写 CSV 工具纯函数属性测试 `src/app/api/cases/__tests__/export.property.test.ts`
    - **Property 14: CSV 字段转义** — 验证 `escapeCsvField` 对含逗号/引号/换行的字符串正确转义
    - **Validates: Requirements 5.6**
    - **Property 13: CSV 导出数据脱敏** — 验证 `sanitizeFormData` 将敏感词替换为 `[已脱敏]`
    - **Validates: Requirements 5.7, 5.8**

- [x] 2. 实现消息 API 路由
  - [x] 2.1 创建 `src/app/api/cases/[id]/messages/route.ts`，实现 GET 和 POST handler
    - GET：使用 `withAuth` 中间件，验证用户为工单提交者/处理者/ADMIN，查询 `prisma.message.findMany` 按 createdAt 升序返回
    - POST：使用 `withAuth` 中间件，zod 校验 content（1-2000 字符），验证工单状态为 IN_PROGRESS/NEED_MORE_INFO，自动设置 senderId/receiverId/caseId/isAnonymous
    - 非活跃状态返回 400「当前状态不允许发送消息」
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 2.2 编写消息 API 属性测试 `src/app/api/cases/__tests__/messages.property.test.ts`
    - **Property 5: 消息 API 访问控制** — 验证仅提交者/处理者/ADMIN 可访问
    - **Validates: Requirements 3.2, 3.3, 3.4**
    - **Property 6: 消息创建字段自动赋值** — 验证 senderId/receiverId/caseId/isAnonymous 正确设置
    - **Validates: Requirements 2.4, 3.6**
    - **Property 7: 消息内容长度校验** — 验证超过 2000 字符返回 400
    - **Validates: Requirements 3.5**
    - **Property 8: 非活跃状态禁止发送消息** — 验证 OPENED/CLOSED 状态返回 400
    - **Validates: Requirements 3.7**
    - **Property 9: 消息列表按时间升序排列** — 验证返回消息按 createdAt 升序
    - **Validates: Requirements 2.5, 3.1**

- [x] 3. 实现 CSV 导出 API 路由
  - [x] 3.1 创建 `src/app/api/cases/[id]/export/route.ts`，实现 GET handler
    - 使用 `withAuth(handler, "ADMIN")` 限制仅 ADMIN 访问
    - 查询工单数据，对 formData 调用 `scanContent` 脱敏，对 submitterId 调用 `hashIP` 哈希
    - 使用 `escapeCsvField` 和 `buildCsvRow` 生成 CSV 内容
    - 设置 `Content-Type: text/csv; charset=utf-8` 和 `Content-Disposition: attachment; filename="case-{id}.csv"`
    - 调用 `logAudit(userId, AuditAction.CASE_EXPORT, ...)` 记录审计
    - 工单不存在返回 404
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 3.2 编写 CSV 导出 API 属性测试（追加到 `src/app/api/cases/__tests__/export.property.test.ts`）
    - **Property 12: CSV 导出仅限 ADMIN** — 验证非 ADMIN 返回 403
    - **Validates: Requirements 5.2, 5.3**

- [x] 4. Checkpoint — 确保所有测试通过
  - 运行 `pnpm vitest --run` 确保所有测试通过，如有问题请向用户确认。

- [x] 5. 实现知识库编辑/删除 API 路由
  - [x] 5.1 创建 `src/app/api/kb/[id]/route.ts`，实现 PATCH 和 DELETE handler
    - PATCH：使用 `withAuth(handler, "ADMIN")`，zod 校验（title ≤ 200，content ≤ 50000），`prisma.knowledgeArticle.update`
    - DELETE：使用 `withAuth(handler, "ADMIN")`，`prisma.knowledgeArticle.delete`，处理 P2025 返回 404
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 5.2 编写知识库 API 属性测试 `src/app/api/kb/[id]/__tests__/route.property.test.ts`
    - **Property 15: 知识库文章更新校验** — 验证 title > 200 或 content > 50000 返回 400
    - **Validates: Requirements 7.1, 7.5**
    - **Property 16: 知识库 API 仅限 ADMIN** — 验证非 ADMIN 返回 403
    - **Validates: Requirements 7.3**

  - [x] 5.3 修改 `src/app/api/kb/route.ts` 的 GET handler，支持 `all=true` 查询参数
    - 当请求者为 ADMIN 且 `all=true` 时，跳过 `isPublished` 过滤，返回所有文章（含草稿）
    - 同时返回 `isPublished` 字段供管理页面使用
    - _Requirements: 6.3_

- [x] 6. 实现准入申请列表 API 路由
  - [x] 6.1 创建 `src/app/api/admin/applications/route.ts`，实现 GET handler
    - 使用 `withAuth(handler, "ADMIN")`
    - 支持 `type`（DCR/PSYCHOLOGY）和 `status`（PENDING/APPROVED/REJECTED）查询参数筛选
    - `prisma.accessApplication.findMany` + include `applicant: { select: { id, nickname } }`
    - 按 `createdAt` 降序排列
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.2 编写申请列表 API 属性测试 `src/app/api/admin/applications/__tests__/route.property.test.ts`
    - **Property 17: 申请列表筛选正确性** — 验证返回记录匹配筛选条件
    - **Validates: Requirements 9.2, 9.3**
    - **Property 18: 申请列表按时间降序排列** — 验证返回记录按 createdAt 降序
    - **Validates: Requirements 9.4**
    - **Property 19: 申请列表 API 仅限 ADMIN** — 验证非 ADMIN 返回 403
    - **Validates: Requirements 9.5, 9.6**

- [x] 7. Checkpoint — 确保所有 API 路由测试通过
  - 运行 `pnpm vitest --run` 确保所有测试通过，如有问题请向用户确认。

- [x] 8. 实现 CaseActionButtons 组件
  - [x] 8.1 创建 `src/components/dcr/CaseActionButtons.tsx`
    - 使用 `getAvailableActions` 纯函数渲染按钮
    - 点击按钮调用 `PATCH /api/cases/[id]` 传递目标状态
    - 请求期间禁用所有按钮并显示加载指示器
    - 成功后调用 `onStatusChange` 回调刷新数据
    - 错误时以 alert 形式展示错误信息
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 8.2 编写 CaseActionButtons 单元测试 `src/components/dcr/__tests__/CaseActionButtons.test.ts`
    - 测试各状态/角色组合下按钮渲染
    - 测试按钮点击触发 API 调用
    - 测试加载状态和错误处理
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 1.8_

- [x] 9. 实现 MessagePanel 组件
  - [x] 9.1 创建 `src/components/dcr/MessagePanel.tsx`
    - 使用 `canSendMessage`、`formatMessageTime`、`isOwnMessage` 纯函数
    - 通过 `GET /api/cases/[id]/messages` 获取消息列表
    - 通过 `POST /api/cases/[id]/messages` 发送消息
    - 自己的消息气泡靠右，对方靠左
    - 非活跃状态隐藏发送表单
    - 发送成功后自动滚动到底部
    - 发送失败在按钮附近显示错误提示
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 9.2 编写 MessagePanel 单元测试 `src/components/dcr/__tests__/MessagePanel.test.ts`
    - 测试消息列表渲染和排序
    - 测试发送表单显示/隐藏逻辑
    - 测试消息气泡左右对齐
    - 测试错误处理
    - _Requirements: 2.1, 2.5, 2.6, 2.8_

- [x] 10. 集成 CaseActionButtons 和 MessagePanel 到工单详情页
  - [x] 10.1 修改 `src/app/dcr/tickets/[id]/page.tsx`，集成 CaseActionButtons 和 MessagePanel 组件
    - 在工单详情页中引入 CaseActionButtons，传递 caseId、status、currentUserId、currentUserRole、submitterId、handlerId、onStatusChange
    - 在工单详情页中引入 MessagePanel，传递 caseId、currentUserId、caseStatus
    - 状态变更后刷新整个页面数据（包括时间线和消息）
    - _Requirements: 1.5, 1.6, 2.1, 2.2_

- [x] 11. 实现 DCR_HELPER 工作台页面
  - [x] 11.1 创建 `src/app/dcr/helper/page.tsx`
    - 客户端检查 session role，非 DCR_HELPER/ADMIN 显示无权限提示
    - 展示两个分区：「待接单工单」（OPENED）和「我的处理中工单」（IN_PROGRESS/NEED_MORE_INFO）
    - 每个工单卡片显示类别、创建时间、状态
    - 点击卡片导航到 `/dcr/tickets/[id]`
    - 使用 `formatHelperCaseCount` 显示处理中工单数量 `N/5`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 11.2 编写 Helper 工作台页面测试 `src/app/dcr/helper/__tests__/helper-page.test.ts`
    - **Property 10: Helper 工作台访问控制** — 验证仅 DCR_HELPER/ADMIN 可见
    - **Validates: Requirements 4.2, 4.3**
    - 测试两个分区渲染
    - 测试工单卡片点击导航
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 12. Checkpoint — 确保前端组件和页面测试通过
  - 运行 `pnpm vitest --run` 确保所有测试通过，如有问题请向用户确认。

- [x] 13. 实现知识库管理后台页面
  - [x] 13.1 创建 `src/app/admin/kb/page.tsx`
    - 使用 `GET /api/kb?all=true` 获取所有文章（含草稿）
    - 展示文章列表：标题、分类、可见性、发布状态、更新时间
    - 提供「新建文章」按钮，点击显示创建表单
    - 每篇文章行提供「编辑」和「删除」操作
    - 编辑表单预填当前数据，提交调用 `PATCH /api/kb/[id]`
    - 删除前显示确认对话框，确认后调用 `DELETE /api/kb/[id]`
    - 表单字段：标题（必填）、内容（必填）、分类（下拉）、可见性（PUBLIC/DCR_ONLY）、是否发布（开关）
    - API 错误时显示错误提示
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_

  - [x] 13.2 编写知识库管理页面测试 `src/app/admin/kb/__tests__/kb-admin-page.test.ts`
    - 测试文章列表渲染
    - 测试新建/编辑/删除操作流程
    - 测试错误处理
    - _Requirements: 6.3, 6.4, 6.6, 6.9, 6.12_

- [x] 14. 实现准入申请审核页面
  - [x] 14.1 创建 `src/app/admin/applications/page.tsx`
    - 使用 `GET /api/admin/applications` 获取申请列表
    - Tab 切换 DCR/PSYCHOLOGY 类型筛选
    - 展示申请人昵称、申请类型、申请时间、当前状态
    - PENDING 状态显示「通过」和「拒绝」按钮
    - 通过：调用 `PATCH /api/dcr/apply/[id]` 或 `PATCH /api/psych/apply/[id]`，传递 `{ status: "APPROVED" }`
    - 拒绝：显示备注输入框，提交调用对应 API 传递 `{ status: "REJECTED", reviewNote }`
    - 审核成功后刷新列表
    - 错误时显示具体错误信息
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11_

  - [x] 14.2 编写申请审核页面测试 `src/app/admin/applications/__tests__/applications-page.test.ts`
    - **Property 20: 审核按钮仅在 PENDING 状态显示** — 验证仅 PENDING 状态显示通过/拒绝按钮
    - **Validates: Requirements 8.5**
    - 测试 Tab 切换筛选
    - 测试通过/拒绝操作流程
    - _Requirements: 8.3, 8.5, 8.6, 8.7_

- [x] 15. 更新 AdminNav 导航组件
  - [x] 15.1 修改 `src/components/layout/AdminNav.tsx`，在 `adminLinks` 数组中追加两项
    - `{ href: "/admin/kb", label: "知识库", icon: BookOpen }`
    - `{ href: "/admin/applications", label: "准入审核", icon: ShieldCheck }`
    - 从 lucide-react 导入 BookOpen 和 ShieldCheck 图标
    - 保持现有导航项和高亮逻辑不变
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 15.2 编写 AdminNav 单元测试 `src/components/layout/__tests__/AdminNav.test.ts`
    - **Property 21: AdminNav 保持现有导航项** — 验证原有 5 个导航项全部存在且链接正确
    - **Validates: Requirements 10.3**
    - **Property 22: AdminNav 激活状态高亮** — 验证 pathname 匹配的导航项具有 `border-primary` 样式
    - **Validates: Requirements 10.4**
    - 测试新增的知识库和准入审核导航项
    - _Requirements: 10.1, 10.2_

- [x] 16. 最终 Checkpoint — 确保所有测试通过
  - 运行 `pnpm vitest --run` 确保所有测试通过，如有问题请向用户确认。

## Notes

- 标记 `*` 的任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- Checkpoint 任务确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 所有 API 路由复用现有 `withAuth` 中间件和 zod 校验模式
- 前端组件使用 `"use client"` + `fetch` 调用 API
