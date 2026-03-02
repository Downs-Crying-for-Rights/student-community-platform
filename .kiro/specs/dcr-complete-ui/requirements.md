# 需求文档：DCR 互助系统完整 UI

## 简介

本需求覆盖 DCR（学生维权互助）系统中所有缺失的前端 UI 功能及少量后端补全。包括工单状态操作按钮、工单内消息/聊天界面、DCR_HELPER 工作台、CSV 导出后端实现、知识库管理后台、准入申请审核界面，以及 AdminNav 导航更新。后端 Prisma 模型（Case、Message、TimelineEvent、AccessApplication、KnowledgeArticle）和大部分 API 路由已存在，本次主要补全前端交互层和少量缺失的后端路由。

## 术语表

- **Case（工单）**: DCR 区的互助委托单，包含类别、表单数据、状态、提交者和处理者
- **CaseStatus（工单状态）**: OPENED（待处理）、IN_PROGRESS（处理中）、NEED_MORE_INFO（待补充）、CLOSED（已关闭）
- **DCR_HELPER**: 拥有 DCR_HELPER 角色的用户，负责接单和处理工单
- **Message（消息）**: 工单内提交者与处理者之间的匿名通信记录
- **TimelineEvent（时间线事件）**: 工单状态变更的历史记录
- **AccessApplication（准入申请）**: 用户申请 DCR 区或心理区访问权限的记录
- **KnowledgeArticle（知识库文章）**: 管理员维护的政策学习与合规渠道文章
- **AdminNav（管理导航）**: 管理后台顶部导航栏组件
- **CSV_Export_Route（CSV 导出路由）**: `/api/cases/[id]/export` 后端接口，生成脱敏 CSV 文件
- **TicketDetailPage（工单详情页）**: `/dcr/tickets/[id]` 页面
- **HelperDashboard（Helper 工作台）**: DCR_HELPER 专属的工单管理视图
- **MessagePanel（消息面板）**: 工单详情页内的消息收发 UI 区域
- **KBAdminPage（知识库管理页）**: Admin 管理知识库文章的后台页面
- **ApplicationReviewPage（申请审核页）**: Admin 审核准入申请的后台页面

## 需求

### 需求 1：工单状态操作按钮

**用户故事：** 作为工单相关方（提交者/DCR_HELPER/Admin），我希望在工单详情页看到与当前状态和角色匹配的操作按钮，以便执行接单、请求补充、关闭等操作。

#### 验收标准

1. WHEN 工单状态为 OPENED 且当前用户角色为 DCR_HELPER 或 ADMIN，THE TicketDetailPage SHALL 显示「接单」按钮
2. WHEN 工单状态为 OPENED 且当前用户为该工单提交者，THE TicketDetailPage SHALL 显示「取消工单」按钮
3. WHEN 工单状态为 IN_PROGRESS 且当前用户为该工单处理者或 ADMIN，THE TicketDetailPage SHALL 显示「请求补充」和「关闭工单」按钮
4. WHEN 工单状态为 NEED_MORE_INFO 且当前用户为该工单提交者或 ADMIN，THE TicketDetailPage SHALL 显示「已补充信息」按钮
5. WHEN 用户点击操作按钮，THE TicketDetailPage SHALL 调用 `PATCH /api/cases/[id]` 并传递目标状态
6. WHEN 状态变更 API 返回成功，THE TicketDetailPage SHALL 刷新工单数据并更新时间线显示
7. IF 状态变更 API 返回错误，THEN THE TicketDetailPage SHALL 以 alert 形式展示错误信息
8. WHILE 状态变更请求进行中，THE TicketDetailPage SHALL 禁用所有操作按钮并显示加载指示器
9. WHEN 工单状态为 CLOSED，THE TicketDetailPage SHALL 隐藏所有状态操作按钮

### 需求 2：工单内消息/聊天界面

**用户故事：** 作为工单提交者或处理者，我希望在工单处理中阶段能通过匿名消息与对方沟通，以便补充信息和协调处理。

#### 验收标准

1. WHILE 工单状态为 IN_PROGRESS 或 NEED_MORE_INFO，THE MessagePanel SHALL 在工单详情页中显示消息列表和发送表单
2. THE MessagePanel SHALL 通过 `GET /api/cases/[id]/messages` 获取该工单的消息列表
3. WHEN 用户提交消息，THE MessagePanel SHALL 调用 `POST /api/cases/[id]/messages` 发送消息
4. THE MessagePanel SHALL 将消息的 isAnonymous 字段设为 true，隐藏发送者真实身份
5. THE MessagePanel SHALL 按 createdAt 升序排列消息，最新消息显示在底部
6. WHEN 当前用户为消息发送者，THE MessagePanel SHALL 将该消息气泡靠右显示；其他消息靠左显示
7. IF 消息发送 API 返回错误，THEN THE MessagePanel SHALL 在发送按钮附近显示错误提示
8. WHEN 工单状态为 OPENED 或 CLOSED，THE MessagePanel SHALL 隐藏消息发送表单
9. THE MessagePanel SHALL 在消息气泡中显示发送时间（格式：MM-DD HH:mm）
10. WHEN 新消息发送成功，THE MessagePanel SHALL 自动滚动到消息列表底部

### 需求 3：消息 API 路由

**用户故事：** 作为系统，我需要提供工单消息的读取和发送 API，以便前端消息面板正常工作。

#### 验收标准

1. THE `GET /api/cases/[id]/messages` 路由 SHALL 返回指定工单的所有消息，按 createdAt 升序排列
2. THE `GET /api/cases/[id]/messages` 路由 SHALL 仅允许工单提交者、处理者或 ADMIN 访问
3. IF 未认证用户访问消息路由，THEN THE 路由 SHALL 返回 401 状态码
4. IF 无权限用户访问消息路由，THEN THE 路由 SHALL 返回 403 状态码
5. THE `POST /api/cases/[id]/messages` 路由 SHALL 创建新消息，content 不超过 2000 字符
6. THE `POST /api/cases/[id]/messages` 路由 SHALL 自动设置 senderId 为当前用户、receiverId 为对方、caseId 为当前工单、isAnonymous 为 true
7. IF 工单状态不是 IN_PROGRESS 或 NEED_MORE_INFO，THEN THE `POST` 路由 SHALL 返回 400 并提示「当前状态不允许发送消息」

### 需求 4：DCR_HELPER 工作台

**用户故事：** 作为 DCR_HELPER，我希望有一个专属工作台页面，以便查看待接单工单和我正在处理的工单。

#### 验收标准

1. THE HelperDashboard SHALL 位于 `/dcr/helper` 路径
2. THE HelperDashboard SHALL 仅对 DCR_HELPER 和 ADMIN 角色可见
3. IF 非 DCR_HELPER 且非 ADMIN 用户访问该页面，THEN THE HelperDashboard SHALL 显示无权限提示
4. THE HelperDashboard SHALL 展示两个分区：「待接单工单」（状态为 OPENED）和「我的处理中工单」（当前用户为 handler 且状态为 IN_PROGRESS 或 NEED_MORE_INFO）
5. THE HelperDashboard SHALL 在每个工单卡片中显示工单类别、创建时间和当前状态
6. WHEN 用户点击工单卡片，THE HelperDashboard SHALL 导航到对应的工单详情页 `/dcr/tickets/[id]`
7. THE HelperDashboard SHALL 显示当前用户正在处理的工单数量（格式：N/5）

### 需求 5：CSV 导出后端实现

**用户故事：** 作为 Admin，我希望能导出工单数据为 CSV 文件，以便进行离线分析和存档。

#### 验收标准

1. THE CSV_Export_Route SHALL 位于 `GET /api/cases/[id]/export`
2. THE CSV_Export_Route SHALL 仅允许 ADMIN 角色访问
3. IF 非 ADMIN 用户访问，THEN THE CSV_Export_Route SHALL 返回 403 状态码
4. IF 工单不存在，THEN THE CSV_Export_Route SHALL 返回 404 状态码
5. THE CSV_Export_Route SHALL 返回 Content-Type 为 `text/csv; charset=utf-8`，Content-Disposition 为 `attachment; filename="case-{id}.csv"`
6. THE CSV_Export_Route SHALL 输出 CSV 头行：`id,category,status,formData,pledgeText,createdAt,submitterId`
7. THE CSV_Export_Route SHALL 对 formData 中的文本调用 scanContent 进行二次脱敏，将检测到的敏感词替换为 `[已脱敏]`
8. THE CSV_Export_Route SHALL 对 submitterId 使用 hashIP 函数进行哈希处理
9. THE CSV_Export_Route SHALL 记录审计日志（action: CASE_EXPORT）

### 需求 6：知识库管理后台

**用户故事：** 作为 Admin，我希望在管理后台创建、编辑和删除知识库文章，以便维护平台的政策学习和合规渠道内容。

#### 验收标准

1. THE KBAdminPage SHALL 位于 `/admin/kb` 路径
2. THE KBAdminPage SHALL 仅对 ADMIN 角色可见
3. THE KBAdminPage SHALL 展示所有知识库文章列表，包含标题、分类、可见性、发布状态和更新时间
4. THE KBAdminPage SHALL 提供「新建文章」按钮，点击后显示创建表单
5. WHEN Admin 提交创建表单，THE KBAdminPage SHALL 调用 `POST /api/kb` 创建文章
6. THE KBAdminPage SHALL 在每篇文章行提供「编辑」和「删除」操作
7. WHEN Admin 点击「编辑」，THE KBAdminPage SHALL 显示编辑表单，预填当前文章数据
8. WHEN Admin 提交编辑表单，THE KBAdminPage SHALL 调用 `PATCH /api/kb/[id]` 更新文章
9. WHEN Admin 点击「删除」，THE KBAdminPage SHALL 显示确认对话框
10. WHEN Admin 确认删除，THE KBAdminPage SHALL 调用 `DELETE /api/kb/[id]` 删除文章
11. THE 文章表单 SHALL 包含以下字段：标题（必填）、内容（必填）、分类（下拉选择）、可见性（PUBLIC/DCR_ONLY）、是否发布（开关）
12. IF API 操作返回错误，THEN THE KBAdminPage SHALL 显示错误提示信息

### 需求 7：知识库文章编辑/删除 API

**用户故事：** 作为系统，我需要提供知识库文章的更新和删除 API，以便管理后台正常工作。

#### 验收标准

1. THE `PATCH /api/kb/[id]` 路由 SHALL 允许 ADMIN 更新文章的 title、content、category、visibility、isPublished 字段
2. THE `DELETE /api/kb/[id]` 路由 SHALL 允许 ADMIN 删除指定文章
3. IF 非 ADMIN 用户调用编辑或删除路由，THEN THE 路由 SHALL 返回 403 状态码
4. IF 文章不存在，THEN THE 路由 SHALL 返回 404 状态码
5. THE `PATCH /api/kb/[id]` 路由 SHALL 对输入进行 zod 校验，title 不超过 200 字符，content 不超过 50000 字符

### 需求 8：准入申请审核界面

**用户故事：** 作为 Admin，我希望在管理后台查看和审核 DCR 区及心理区的准入申请，以便控制敏感区域的访问权限。

#### 验收标准

1. THE ApplicationReviewPage SHALL 位于 `/admin/applications` 路径
2. THE ApplicationReviewPage SHALL 仅对 ADMIN 角色可见
3. THE ApplicationReviewPage SHALL 提供 Tab 切换：「DCR 准入」和「心理区准入」
4. THE ApplicationReviewPage SHALL 展示申请列表，包含申请人昵称、申请类型、申请时间、当前状态
5. WHEN 申请状态为 PENDING，THE ApplicationReviewPage SHALL 在该行显示「通过」和「拒绝」按钮
6. WHEN Admin 点击「通过」，THE ApplicationReviewPage SHALL 调用 `PATCH /api/dcr/apply/[id]`（DCR 类型）或 `PATCH /api/psych/apply/[id]`（心理区类型），传递 `{ status: "APPROVED" }`
7. WHEN Admin 点击「拒绝」，THE ApplicationReviewPage SHALL 显示审核备注输入框
8. WHEN Admin 提交拒绝操作，THE ApplicationReviewPage SHALL 调用对应 API 传递 `{ status: "REJECTED", reviewNote }`
9. WHEN 审核操作成功，THE ApplicationReviewPage SHALL 刷新申请列表
10. IF 审核 API 返回错误（如冷启动限额已满），THEN THE ApplicationReviewPage SHALL 显示具体错误信息
11. THE ApplicationReviewPage SHALL 需要一个 `GET /api/admin/applications` 路由来获取申请列表，支持按 type 和 status 筛选

### 需求 9：准入申请列表 API

**用户故事：** 作为系统，我需要提供准入申请的列表查询 API，以便审核界面获取数据。

#### 验收标准

1. THE `GET /api/admin/applications` 路由 SHALL 返回 AccessApplication 列表，包含关联的 applicant 信息（id、nickname）
2. THE 路由 SHALL 支持 `type` 查询参数（DCR/PSYCHOLOGY）进行筛选
3. THE 路由 SHALL 支持 `status` 查询参数（PENDING/APPROVED/REJECTED）进行筛选
4. THE 路由 SHALL 按 createdAt 降序排列
5. THE 路由 SHALL 仅允许 ADMIN 角色访问
6. IF 非 ADMIN 用户访问，THEN THE 路由 SHALL 返回 403 状态码

### 需求 10：AdminNav 导航更新

**用户故事：** 作为 Admin，我希望管理后台导航栏包含新增管理页面的入口，以便快速访问知识库管理和申请审核页面。

#### 验收标准

1. THE AdminNav SHALL 新增「知识库」导航项，链接到 `/admin/kb`，使用 BookOpen 图标
2. THE AdminNav SHALL 新增「准入审核」导航项，链接到 `/admin/applications`，使用 ShieldCheck 图标
3. THE AdminNav SHALL 保持现有导航项不变（用户管理、内容管理、邀请码、操作日志、板块管理）
4. THE AdminNav SHALL 对当前激活的导航项应用高亮样式（与现有行为一致）
