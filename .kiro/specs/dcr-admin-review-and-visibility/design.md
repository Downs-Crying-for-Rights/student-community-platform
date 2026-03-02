# DCR 管理员审核与可见性 Bugfix 设计

## Overview

本设计文档覆盖三个相互关联的 DCR 模块 bug：

1. **管理员审核页面缺少委托表详情** — `AccessApplication` 模型不含 `formData`，需通过 `applicantId` 关联查询 `Case` 表获取委托表数据，并在 UI 中展示。
2. **侧边栏 DCR 入口逻辑错误** — 有 `dcrAccess` 的用户应看到「DCR 互助区」（→ `/dcr/tickets`），而非四步流程入口（`/dcr`）。无权限用户不显示任何 DCR 导航项。
3. **提交委托表后流程回退** — `GET /api/cases` 对非 ADMIN 用户强制要求 `dcrAccess=true`，导致刚提交委托表但尚未获得 `dcrAccess` 的用户无法查询自己的 Case，`computeFlowStep` 回退到步骤 1。

修复策略：最小化改动，分别修复 API 数据查询、侧边栏导航配置、Cases API 权限逻辑。

## Glossary

- **Bug_Condition (C)**: 触发 bug 的条件集合 — 管理员查看申请详情时缺少 formData；有 dcrAccess 用户看到错误导航；无 dcrAccess 用户提交 Case 后无法查询
- **Property (P)**: 修复后的期望行为 — 管理员能看到完整委托表；侧边栏显示正确入口；用户提交后进入步骤 2
- **Preservation**: 现有行为不受影响 — 审核通过/拒绝流程、心理区导航、底部导航栏、已有 dcrAccess 用户的 Cases 查询
- **AccessApplication**: `prisma/schema.prisma` 中的准入申请模型，不含 `formData`
- **Case**: `prisma/schema.prisma` 中的委托工单模型，含 `formData`（Json）和 `pledgeText`
- **computeFlowStep**: `src/lib/dcr-flow-helpers.ts` 中的纯函数，根据 caseStatus/quizPassed/dcrAccess 计算流程步骤

## Bug Details

### Fault Condition

三个 bug 共享一个根因模式：数据模型设计与 UI/API 逻辑之间的不匹配。

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { context: "admin_review" | "sidebar" | "flow_step", user: User, application?: AccessApplication, case?: Case }
  OUTPUT: boolean

  // Bug 1: 管理员查看申请但看不到 formData
  IF input.context == "admin_review"
    RETURN input.application EXISTS
           AND input.application.formData IS UNDEFINED
           AND relatedCase(input.application.applicantId).formData EXISTS

  // Bug 2: 有 dcrAccess 但看到错误导航
  IF input.context == "sidebar"
    RETURN input.user.dcrAccess == true
           AND sidebarShows("/dcr") == true
           AND sidebarShows("/dcr/tickets") == false

  // Bug 3: 无 dcrAccess 用户提交 Case 后无法查询
  IF input.context == "flow_step"
    RETURN input.user.dcrAccess == false
           AND input.case EXISTS AND input.case.submitterId == input.user.id
           AND GET_API_CASES(input.user) RETURNS 403
END FUNCTION
```

### Examples

- **Bug 1**: 管理员打开 `/admin/applications`，看到申请人「张三」的 DCR 申请，但只有昵称、类型、时间、状态，无法看到委托表中的学校名称、行为描述、诉求等关键信息
- **Bug 2**: 用户已通过四步流程获得 `dcrAccess=true`，侧边栏显示「DCR 区」（→ `/dcr`）和「DCR 帖子」，点击「DCR 区」进入四步流程页面而非互助区
- **Bug 3**: 用户在 `/dcr/delegate` 提交委托表 → `POST /api/cases` 成功 → 跳转 `/dcr` → `GET /api/cases?pageSize=1` 返回 403 → `latestCase=null` → `computeFlowStep(null, false, false)=1` → 用户被困在步骤 1
- **边界**: 拥有 `dcrAccess=true` 的用户调用 `GET /api/cases` 正常返回（不受影响）

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `GET /api/admin/applications` 继续正确返回申请列表（增加关联 Case 数据不影响现有字段）
- `PATCH /api/dcr/apply/[id]` 的审核通过/拒绝逻辑不变
- 心理区（`psychAccess`）侧边栏导航逻辑不变
- 底部导航栏（BottomNav）不显示 DCR 入口
- 拥有 `dcrAccess=true` 的用户调用 `GET /api/cases` 正常返回
- 未登录用户调用 `GET /api/cases` 返回 401
- 管理员审核通过后的通知和审计日志不变

**Scope:**
不涉及 bug 条件的输入完全不受影响：
- 心理区申请审核流程
- 非 DCR 相关的侧边栏导航项
- 已有 `dcrAccess` 用户的 Cases API 调用
- 所有 POST/PATCH API 端点

## Hypothesized Root Cause

Based on the bug description, the most likely issues are:

1. **数据模型断裂（Bug 1）**: `AccessApplication` 模型没有 `formData` 字段，委托表数据存储在 `Case` 模型中。`GET /api/admin/applications` 只查询 `AccessApplication`，不关联 `Case` 表。管理员审核页面 UI 也没有展示 `formData` 的组件。

2. **侧边栏导航配置错误（Bug 2）**: `Sidebar.tsx` 中 `zoneNavItems` 配置了 `{ href: "/dcr", label: "DCR 区", requireDcrAccess: true }` 和 `{ href: "/dcr/posts", label: "DCR 帖子", requireDcrAccess: true }`。`/dcr` 是四步流程页面，已完成流程的用户不应再看到此入口，应改为 `/dcr/tickets`（互助区）。

3. **Cases API 权限过严（Bug 3）**: `GET /api/cases` 对非 ADMIN 用户检查 `dcrAccess`，但用户提交委托表（`POST /api/cases`）时不需要 `dcrAccess`（已移除该限制）。这导致用户能创建 Case 但无法查询自己的 Case。应允许用户查询自己提交的 Case，无论 `dcrAccess` 状态。

## Correctness Properties

Property 1: Fault Condition - 管理员审核页面展示委托表详情

_For any_ DCR 类型的 AccessApplication，当管理员在 `/admin/applications` 页面查看时，系统 SHALL 通过 applicantId 关联查询该申请人最近的 Case 记录，并在 UI 中展示 formData 中的详细字段（学校名称、行为描述、诉求等）和 pledgeText 声明文本。

**Validates: Requirements 2.1**

Property 2: Fault Condition - 侧边栏 DCR 入口正确显示

_For any_ 拥有 `dcrAccess=true` 的用户，侧边栏 SHALL 显示「DCR 互助区」导航项（指向 `/dcr/tickets`），不显示四步流程入口（`/dcr`）。对于无 `dcrAccess` 的用户，侧边栏 SHALL 不显示任何 DCR 相关导航项。

**Validates: Requirements 2.2, 2.3**

Property 3: Fault Condition - 无 dcrAccess 用户可查询自己的 Case

_For any_ 已认证但无 `dcrAccess` 的用户，当该用户已提交过 Case 时，`GET /api/cases` SHALL 返回该用户自己提交的 Case 列表（而非 403），使 `computeFlowStep` 能正确计算流程步骤。

**Validates: Requirements 2.4**

Property 4: Preservation - 现有功能不受影响

_For any_ 不涉及 bug 条件的输入（心理区导航、已有 dcrAccess 用户的 Cases 查询、审核通过/拒绝流程、底部导航栏），修复后的代码 SHALL 产生与修复前完全相同的行为。

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**


## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/app/api/admin/applications/route.ts`

**Function**: `GET handler`

**Specific Changes**:
1. **关联查询 Case 数据**: 在查询 `AccessApplication` 后，对 DCR 类型的申请通过 `applicantId` 查询该用户最近的 `Case` 记录，将 `formData` 和 `pledgeText` 附加到返回数据中
2. **返回扩展数据**: 在 response 中包含 `relatedCase` 字段（含 formData、pledgeText、category、status）

---

**File**: `src/app/admin/applications/page.tsx`

**Function**: `ApplicationReviewPage`

**Specific Changes**:
1. **扩展 ApplicationItem 接口**: 添加 `relatedCase` 可选字段（含 formData、pledgeText）
2. **添加展开/收起详情组件**: 在每行申请下方添加可展开区域，展示 formData 中的字段（学校名称、学校性质、学校地址、举报途径、行为描述、收费情况、诉求列表）和 pledgeText
3. **使用 `<details>` 或状态控制展开/收起**

---

**File**: `src/components/layout/Sidebar.tsx`

**Constant**: `zoneNavItems`

**Specific Changes**:
1. **修改 DCR 导航项**: 将 `{ href: "/dcr", label: "DCR 区" }` 改为 `{ href: "/dcr/tickets", label: "DCR 互助区" }`
2. **移除 DCR 帖子入口**: 删除 `{ href: "/dcr/posts", label: "DCR 帖子" }` 条目（或合并到互助区内）

---

**File**: `src/app/api/cases/route.ts`

**Function**: `GET handler`

**Specific Changes**:
1. **放宽权限检查**: 对非 ADMIN、非 dcrAccess 用户，不再返回 403，而是允许查询 `submitterId === userId` 的 Case
2. **保持 dcrAccess 用户的现有查询逻辑不变**: DCR_HELPER 和有 dcrAccess 的普通用户继续使用现有 where 条件
3. **具体实现**: 将 `dcrAccess` 检查移到 where 条件构建之后，对无 dcrAccess 的普通用户强制 `where.submitterId = userId`

## Testing Strategy

### Validation Approach

测试策略分两阶段：先在未修复代码上验证 bug 存在（探索性测试），再验证修复正确性和行为保持。

### Exploratory Fault Condition Checking

**Goal**: 在实施修复前，通过测试确认 bug 的存在和根因。

**Test Plan**: 编写测试模拟三个 bug 场景，在未修复代码上运行观察失败。

**Test Cases**:
1. **管理员申请详情测试**: 调用 `GET /api/admin/applications?type=DCR`，验证返回数据中是否包含 formData（预期：不包含，测试失败）
2. **侧边栏导航测试**: 渲染 Sidebar 组件（dcrAccess=true），验证是否显示 `/dcr/tickets` 链接（预期：不显示，测试失败）
3. **无 dcrAccess 用户查询 Case 测试**: 以无 dcrAccess 用户身份调用 `GET /api/cases`，验证是否返回 403（预期：返回 403，确认 bug）
4. **流程步骤回退测试**: 模拟用户提交 Case 后调用 `GET /api/cases`，验证 latestCase 是否为 null（预期：为 null，确认 bug）

**Expected Counterexamples**:
- `GET /api/admin/applications` 返回的 application 对象中无 formData 字段
- Sidebar 渲染结果中包含 `/dcr` 链接而非 `/dcr/tickets`
- 无 dcrAccess 用户调用 `GET /api/cases` 返回 403

### Fix Checking

**Goal**: 验证修复后，所有 bug 条件下的输入都产生正确行为。

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: 验证修复后，所有非 bug 条件的输入产生与原函数相同的结果。

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: 属性基测试（PBT）适用于保持性检查，因为：
- 自动生成大量测试用例覆盖输入域
- 捕获手动单元测试可能遗漏的边界情况
- 对非 bug 输入的行为不变性提供强保证

**Test Plan**: 先在未修复代码上观察非 bug 输入的行为，再编写 PBT 测试验证修复后行为一致。

**Test Cases**:
1. **心理区导航保持**: 验证 psychAccess 用户的侧边栏导航在修复后不变
2. **已有 dcrAccess 用户 Cases 查询保持**: 验证有 dcrAccess 的用户调用 GET /api/cases 返回结果不变
3. **审核流程保持**: 验证 PATCH /api/dcr/apply/[id] 的通过/拒绝逻辑不变
4. **底部导航栏保持**: 验证 BottomNav 不显示 DCR 入口

### Unit Tests

- 测试 `GET /api/admin/applications` 返回关联的 Case formData
- 测试 Sidebar 在 dcrAccess=true 时显示 `/dcr/tickets`
- 测试 Sidebar 在 dcrAccess=false 时不显示 DCR 导航项
- 测试 `GET /api/cases` 允许无 dcrAccess 用户查询自己的 Case
- 测试 `GET /api/cases` 对无 dcrAccess 且无 Case 的用户返回空列表（非 403）

### Property-Based Tests

- 生成随机用户角色和 dcrAccess 状态，验证侧边栏导航项的正确性
- 生成随机 Case 状态和 dcrAccess 组合，验证 computeFlowStep 返回正确步骤
- 生成随机 ApplicationItem 数据，验证管理员页面正确展示 formData 字段

### Integration Tests

- 完整流程测试：用户提交委托表 → 跳转 /dcr → 查询 Case → 显示步骤 2
- 管理员审核流程：查看申请列表 → 展开详情 → 查看 formData → 通过/拒绝
- 侧边栏导航切换：用户获得 dcrAccess 后侧边栏从无 DCR 入口变为显示互助区入口
