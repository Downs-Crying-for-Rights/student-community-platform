# Bugfix 需求文档

## 简介

本文档涵盖三个 DCR 相关的 bug：

1. **管理员审核页面 UI 不适配** — `/admin/applications` 页面只显示申请人、类型、时间、状态等基本信息，无法展示委托表详细内容（`formData` 中的学校信息、描述、诉求等）和 `pledgeText` 声明文本。管理员无法查看申请详情就做出审核决定。
2. **DCR 侧边栏入口显示逻辑不正确** — 当前逻辑：无 `dcrAccess` 时隐藏 DCR 入口，有 `dcrAccess` 时显示。正确逻辑：有 `dcrAccess` 时显示 DCR 入口（进入互助区），同时隐藏审核入口（`/dcr` 四步流程页面）；无 `dcrAccess` 时不显示 DCR 入口（用户只能通过直接访问 `/dcr` URL 进入四步流程）。
3. **用户填完委托表后流程跳回第一步** — 用户在 `/dcr/delegate` 提交委托表后，`POST /api/cases` 成功创建 Case（status=OPENED），页面跳转回 `/dcr`。但 `/dcr` 页面通过 `GET /api/cases?pageSize=1` 获取最新 Case 时，该接口要求 `dcrAccess=true`，而刚提交委托表的用户尚未获得 `dcrAccess`，导致返回 403。`latestCase` 为 `null`，`computeFlowStep(null, false, false)` 返回步骤 1，用户被困在第一步无法进入「等待审核」状态。

## Bug 分析

### 当前行为（缺陷）

1.1 WHEN 管理员在 `/admin/applications` 页面查看 DCR 申请列表 THEN 表格只显示申请人昵称、类型、时间、状态，不显示委托表中的学校信息、行为描述、诉求、收费情况等详细内容，也不显示 `pledgeText` 声明文本，管理员无法了解申请详情

1.2 WHEN 无 `dcrAccess` 的用户访问首页 THEN 侧边栏不显示 DCR 入口（这是正确的，但用户获得 `dcrAccess` 后应该显示 DCR 互助区入口）

1.3 WHEN 拥有 `dcrAccess: true` 的用户访问首页 THEN 侧边栏显示「DCR 区」（指向 `/dcr` 四步流程页面）和「DCR 帖子」，但此时用户已完成四步流程，不应再看到四步流程入口，应该直接进入互助区

1.4 WHEN 用户在 `/dcr/delegate` 提交委托表后跳转回 `/dcr` THEN 页面调用 `GET /api/cases?pageSize=1` 获取最新 Case，但该接口要求 `dcrAccess=true`，返回 403，导致 `latestCase` 为 `null`，`computeFlowStep(null, false, false)` 返回步骤 1，用户被困在第一步循环

### 期望行为（正确）

2.1 WHEN 管理员在 `/admin/applications` 页面查看 DCR 申请列表 THEN 系统 SHALL 在每条申请中展示委托表详细信息：内容类型、学校名称、学校性质/类型、学校地址、举报途径、行为描述、收费情况、诉求列表，以及 `pledgeText` 声明文本，支持展开/收起

2.2 WHEN 拥有 `dcrAccess: true` 的用户访问首页 THEN 侧边栏 SHALL 显示「DCR 互助区」导航项（指向 `/dcr/tickets`），不显示四步流程入口（`/dcr`）

2.3 WHEN 无 `dcrAccess` 的用户访问首页 THEN 侧边栏 SHALL 不显示任何 DCR 相关导航项，用户只能通过直接访问 `/dcr` URL 进入四步流程

2.4 WHEN 用户在 `/dcr/delegate` 提交委托表后跳转回 `/dcr` THEN 页面 SHALL 能够获取到该用户刚创建的 Case（status=OPENED），`computeFlowStep("OPENED", false, false)` 返回步骤 2，用户看到「等待审核」状态

### 不变行为（回归防护）

3.1 WHEN 管理员通过 `GET /api/admin/applications` 获取申请列表 THEN 系统 SHALL CONTINUE TO 正确返回申请列表数据

3.2 WHEN 非 ADMIN 用户尝试调用 `PATCH /api/dcr/apply/[id]` THEN 系统 SHALL CONTINUE TO 返回 403 权限不足错误

3.3 WHEN 拥有 `psychAccess: true` 的用户访问首页 THEN 侧边栏 SHALL CONTINUE TO 正常显示「心理区」导航项

3.4 WHEN 用户直接访问 `/dcr` URL 且拥有 `dcrAccess: true` THEN 系统 SHALL CONTINUE TO 允许用户正常访问 DCR 区页面

3.5 WHEN 管理员审核通过申请后 THEN 系统 SHALL CONTINUE TO 发送通知给申请人并记录审计日志

3.6 WHEN 底部导航栏（BottomNav）渲染时 THEN 系统 SHALL CONTINUE TO 不显示任何 DCR 相关入口（当前底部导航无 DCR 项，需保持不变）

3.7 WHEN 拥有 `dcrAccess=true` 的用户调用 `GET /api/cases` THEN 系统 SHALL CONTINUE TO 正常返回该用户的 Case 列表

3.8 WHEN 非登录用户调用 `GET /api/cases` THEN 系统 SHALL CONTINUE TO 返回 401 未授权错误
