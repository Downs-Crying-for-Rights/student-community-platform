# DCR 工单流程全面修复 Bugfix Design

## Overview

DCR 工单系统存在五个关联 Bug：(1) 工单列表查询逻辑在 status 筛选与 OR 条件组合时产生冲突，导致筛选结果不正确；(2) 工单流程缺乏引导说明和侧边栏子导航；(3) 消息系统仅支持一对一且 OPENED 状态不允许发送消息，缺乏自动刷新；(4) DCR 帖子对所有 dcrAccess 用户可见而非仅工单参与者；(5) Case 模型仅支持单一 handlerId，无法多人互助。

修复策略：通过数据模型重构（CaseHandler 关联表、Post.caseId 字段）、API 查询逻辑修正、UI 流程引导增强、消息通道群组化和轮询机制来系统性解决这些问题。

## Glossary

- **Bug_Condition (C)**: 触发 Bug 的条件集合——包括 status 筛选与 OR 条件冲突、缺少流程引导、消息一对一限制、帖子可见性过宽、单一 handlerId 限制
- **Property (P)**: 修复后的期望行为——查询结果正确、流程透明、群组消息、帖子按工单隔离、多人互助
- **Preservation**: 修复不应影响的现有行为——Admin 全量查询、状态机规则、CLOSED 禁止发消息、审计日志、准入流程
- **GET /api/cases**: `src/app/api/cases/route.ts` 中的工单列表 API，使用 OR 条件构建查询
- **PATCH /api/cases/[id]**: `src/app/api/cases/[id]/route.ts` 中的状态变更 API，包含接单逻辑
- **canSendMessage()**: `src/lib/dcr-ui-helpers.ts` 中判断是否允许发送消息的纯函数
- **CaseHandler**: 新增的关联表，替代 Case.handlerId 单一字段，支持多人处理

## Bug Details

### Fault Condition

Bug 在以下五种条件下触发：

1. **查询冲突**：当用户在工单列表页使用 status 筛选时，`where.status = status` 与 `where.OR = [{ status: "OPENED" }]` 同时存在，Prisma 将其解释为 AND 关系，导致非 OPENED 状态筛选时 OR 中的 `{ status: "OPENED" }` 子句永远不匹配
2. **流程不透明**：用户进入工单系统后无任何引导说明，侧边栏仅有单一 "DCR 互助区" 入口
3. **消息限制**：Message.receiverId 为单一字段，canSendMessage() 仅允许 IN_PROGRESS/NEED_MORE_INFO 状态
4. **帖子可见性过宽**：DCR 帖子通过 `zone=DCR` 查询，对所有 dcrAccess 用户可见，Post 模型无 caseId 字段
5. **单一处理者**：Case.handlerId 为 `String?`，PATCH 接单直接覆盖 handlerId

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { action, context }
  OUTPUT: boolean

  // Bug 1: 查询冲突
  IF input.action = "LIST_CASES" AND input.context.statusFilter != null
     AND input.context.userRole != "ADMIN" AND input.context.userRole != "SUPER_ADMIN"
     AND input.context.hasDcrAccess = true
  THEN RETURN true  // OR 条件中 status:"OPENED" 与外层 status 筛选冲突

  // Bug 2: 流程不透明
  IF input.action = "VIEW_TICKET_LIST" AND input.context.isFirstVisit = true
  THEN RETURN true  // 无流程引导

  IF input.action = "NAVIGATE_SIDEBAR" AND input.context.hasDcrAccess = true
     AND input.context.targetPage IN ["helper", "posts"]
  THEN RETURN true  // 无独立入口

  // Bug 3: 消息限制
  IF input.action = "SEND_MESSAGE" AND input.context.caseStatus = "OPENED"
     AND input.context.isSubmitter = true
  THEN RETURN true  // OPENED 状态不允许发消息

  IF input.action = "SEND_MESSAGE" AND input.context.participantCount > 2
  THEN RETURN true  // 一对一限制无法群组通信

  IF input.action = "WAIT_MESSAGE" AND input.context.hasPolling = false
  THEN RETURN true  // 无自动刷新

  // Bug 4: 帖子可见性
  IF input.action = "VIEW_DCR_POSTS" AND input.context.hasDcrAccess = true
     AND input.context.isParticipantOfAllVisiblePosts = false
  THEN RETURN true  // 看到了不属于自己工单的帖子

  // Bug 5: 多人互助
  IF input.action = "JOIN_CASE" AND input.context.caseHasHandler = true
     AND input.context.handlerCount < 5
  THEN RETURN true  // 无法加入已有处理者的工单

  RETURN false
END FUNCTION
```

### Examples

- **查询冲突示例**: DCR_HELPER 用户筛选 `status=IN_PROGRESS`，API 构建 `where = { status: "IN_PROGRESS", OR: [{ handlerId: userId }, { status: "OPENED" }, { submitterId: userId }] }`，Prisma 解释为 `status=IN_PROGRESS AND (handlerId=userId OR status=OPENED OR submitterId=userId)`，其中 `status: "OPENED"` 子句因与外层 `status: "IN_PROGRESS"` 矛盾而永远为 false，导致用户看不到其他人处理中但自己提交的工单（除非 submitterId 匹配）
- **OPENED 消息示例**: 用户创建工单后想补充信息，MessagePanel 的 `canSendMessage("OPENED")` 返回 false，发送表单不显示
- **帖子可见性示例**: 用户 A 参与工单 #1，用户 B 参与工单 #2，两人都能在 `/dcr/posts` 看到对方工单的帖子
- **多人互助示例**: Helper A 已接单工单 #1（状态 IN_PROGRESS），Helper B 想加入协助，但 PATCH API 的 `OPENED→IN_PROGRESS` 转换要求当前状态为 OPENED，无法在 IN_PROGRESS 状态加入

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Admin/SUPER_ADMIN 访问 GET /api/cases 时返回所有工单，不受查询条件限制（3.1）
- 没有 dcrAccess 的用户仅能查看自己提交的工单（3.2）
- 四步向导创建工单流程（类别选择→表单填写→隐私扫描→强制声明）保持不变，创建后状态为 OPENED（3.3）
- 状态机规则保持不变：OPENED→IN_PROGRESS/CLOSED, IN_PROGRESS→NEED_MORE_INFO/CLOSED, NEED_MORE_INFO→IN_PROGRESS（3.4）
- CLOSED 状态禁止发送消息且不显示操作按钮（3.5）
- 工单详情页权限检查（仅提交者、处理者、ADMIN 可访问）和审计日志保持不变（3.6）
- DCR_HELPER 并发处理上限 5 个活跃工单（3.7）
- 消息发送时 isAnonymous=true（3.8）
- computeFlowStep 函数逻辑保持不变（3.9）

**Scope:**
所有不涉及上述五个 Bug 条件的输入应完全不受修复影响，包括：
- 非 DCR 相关的 API 调用
- Admin 的全量查询
- 工单创建流程
- 状态机转换规则（仅扩展加入逻辑，不修改现有转换）

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **查询逻辑缺陷（Bug 1）**: `GET /api/cases` 在 `src/app/api/cases/route.ts` 中先设置 `where.status = status`（L128），再设置 `where.OR`（L133-137）。Prisma 将顶层字段视为 AND 关系，导致 `status` 筛选与 OR 中的 `{ status: "OPENED" }` 冲突。应将 status 筛选条件嵌入每个 OR 子句内部，或重构查询逻辑为显式 AND/OR 组合。

2. **UI 缺失（Bug 2）**: `src/app/dcr/tickets/page.tsx` 无流程引导组件；`src/components/layout/Sidebar.tsx` 的 `zoneNavItems` 仅有一个 `/dcr/tickets` 入口，缺少 `/dcr/helper` 和 `/dcr/posts` 的独立导航项。

3. **数据模型限制（Bug 3）**: `Message.receiverId` 为单一 `String` 字段，无法支持群组消息。`canSendMessage()` 在 `src/lib/dcr-ui-helpers.ts` 中硬编码仅允许 `IN_PROGRESS | NEED_MORE_INFO`。`MessagePanel` 组件无轮询/自动刷新逻辑。

4. **缺少关联（Bug 4）**: `Post` 模型无 `caseId` 字段，`/dcr/posts` 页面通过 `zone=DCR` 查询所有 DCR 帖子，无法按工单隔离可见性。

5. **单一外键（Bug 5）**: `Case.handlerId` 为 `String?`，仅支持一个处理者。接单逻辑在 `PATCH /api/cases/[id]` 中直接设置 `updateData.handlerId = userId`，无法支持多人加入。

## Correctness Properties

Property 1: Fault Condition - 工单列表查询在 status 筛选时返回正确结果

_For any_ 拥有 dcrAccess 的非 Admin 用户，当使用 status 筛选参数查询工单列表时，修复后的 GET /api/cases SHALL 返回满足以下条件的工单：用户是提交者（submitterId=userId）或用户是处理者之一（通过 CaseHandler 关联），且工单状态匹配筛选条件；当不使用 status 筛选时，还应包含所有 OPENED 状态的工单。

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Admin 全量查询和状态机规则不变

_For any_ Admin/SUPER_ADMIN 用户查询工单列表，修复后的 GET /api/cases SHALL 返回与修复前完全相同的结果集。_For any_ 状态转换请求，修复后的 PATCH /api/cases/[id] SHALL 遵循与修复前相同的状态机规则（OPENED→IN_PROGRESS/CLOSED, IN_PROGRESS→NEED_MORE_INFO/CLOSED, NEED_MORE_INFO→IN_PROGRESS），CLOSED 状态禁止发消息，消息 isAnonymous=true。

**Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.7, 3.8, 3.9**

Property 3: Fault Condition - 多人互助支持

_For any_ DCR_HELPER 用户尝试加入一个已有处理者的工单（状态为 OPENED 或 IN_PROGRESS），当该工单处理者数量 < 5 且该用户活跃工单数 < 5 时，修复后的 API SHALL 允许该用户成为工单的处理者之一。

**Validates: Requirements 2.11, 2.12**

Property 4: Fault Condition - 消息通道群组化和 OPENED 状态补充信息

_For any_ 工单参与者（提交者或任一处理者），当工单状态为 IN_PROGRESS 或 NEED_MORE_INFO 时，修复后的消息 API SHALL 允许发送消息且所有参与者可见。当工单状态为 OPENED 时，提交者 SHALL 可以单向发送补充信息。

**Validates: Requirements 2.6, 2.7, 2.8**

Property 5: Fault Condition - DCR 帖子按工单隔离可见性

_For any_ 拥有 dcrAccess 的用户访问 DCR 帖子页面，修复后 SHALL 仅显示与该用户参与的工单（作为提交者或处理者之一）关联的帖子。

**Validates: Requirements 2.9, 2.10**


## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

### 1. 数据模型变更（Prisma Schema）

**File**: `prisma/schema.prisma`

**Specific Changes**:

1. **新增 CaseHandler 关联表**: 替代 Case.handlerId 单一字段
   ```prisma
   model CaseHandler {
     id        String   @id @default(cuid())
     caseId    String
     userId    String
     joinedAt  DateTime @default(now())
     case_     Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
     user      User     @relation(fields: [userId], references: [id])
     @@unique([caseId, userId])
   }
   ```

2. **Post 模型新增 caseId 字段**: 关联帖子到工单
   ```prisma
   model Post {
     // ... existing fields
     caseId String?
     case_  Case?  @relation(fields: [caseId], references: [id])
   }
   ```

3. **保留 Case.handlerId**: 作为"主处理者"向后兼容，同时新增 `handlers CaseHandler[]` 关联
   ```prisma
   model Case {
     // ... existing fields
     handlers CaseHandler[]
     posts    Post[]
   }
   ```

4. **User 模型新增关联**:
   ```prisma
   model User {
     // ... existing fields
     caseHandlers CaseHandler[]
   }
   ```

### 2. 工单列表查询修复

**File**: `src/app/api/cases/route.ts`

**Function**: `GET handler`

**Specific Changes**:
1. **重构 where 条件构建**: 将 status 筛选嵌入 OR 子句内部，避免顶层 AND 冲突
   ```typescript
   // 修复前（有冲突）:
   // where.status = status;
   // where.OR = [{ handlerId: userId }, { status: "OPENED" }, { submitterId: userId }];

   // 修复后:
   if (isAdminLevel) {
     if (status) where.status = status;
   } else if (userRole === "DCR_HELPER" || hasDcrAccess) {
     const orClauses = [
       { handlers: { some: { userId } } },  // 用户是处理者之一
       { submitterId: userId },               // 用户是提交者
     ];
     if (!status || status === "OPENED") {
       orClauses.push({ status: "OPENED" as const }); // 仅在不筛选或筛选 OPENED 时包含
     }
     where.AND = [
       { OR: orClauses },
       ...(status ? [{ status }] : []),
     ];
   } else {
     where.submitterId = userId;
     if (status) where.status = status;
   }
   ```

### 3. 多人互助接单逻辑

**File**: `src/app/api/cases/[id]/route.ts`

**Function**: `PATCH handler`

**Specific Changes**:
1. **扩展状态转换**: 允许 IN_PROGRESS 状态下加入新处理者（新增 "JOIN" action）
2. **接单时创建 CaseHandler 记录**: 替代直接设置 handlerId
3. **加入逻辑**: 检查工单处理者数量 ≤ 5，检查用户并发工单数 ≤ 5
4. **保持 handlerId 兼容**: 首个接单者同时设置 handlerId（主处理者）

### 4. 消息系统改造

**File**: `src/app/api/cases/[id]/messages/route.ts`

**Specific Changes**:
1. **GET 权限扩展**: 检查 CaseHandler 关联表而非仅 handlerId
2. **POST 状态放宽**: 允许 OPENED 状态下提交者发送补充信息（单向）
3. **POST 移除 receiverId 依赖**: 消息通过 caseId 关联，所有参与者可见（群组模式）

**File**: `src/lib/dcr-ui-helpers.ts`

**Function**: `canSendMessage()`

**Specific Changes**:
1. **扩展允许状态**: 新增参数 `isSubmitter`，OPENED 状态下提交者可发送

**File**: `src/components/dcr/MessagePanel.tsx`

**Specific Changes**:
1. **新增轮询机制**: 每 15 秒自动刷新消息列表
2. **页面可见性检测**: 使用 `document.visibilitychange` 事件，页面重新可见时刷新
3. **传递 isSubmitter prop**: 用于 OPENED 状态下的发送权限判断

### 5. 帖子可见性控制

**File**: `src/app/dcr/posts/page.tsx`

**Specific Changes**:
1. **替换查询方式**: 不再使用 `zone=DCR`，改为先获取用户参与的工单 ID 列表，再查询关联帖子
2. **API 层面**: 新增或修改帖子查询 API 支持 `caseId` 筛选

### 6. UI 流程引导和导航

**File**: `src/app/dcr/tickets/page.tsx`

**Specific Changes**:
1. **新增流程引导组件**: 在工单列表页顶部展示工单状态流转说明（待处理→处理中→待补充→已关闭）
2. **区分准入审核和工单流程**: 添加说明文字

**File**: `src/components/layout/Sidebar.tsx`

**Specific Changes**:
1. **扩展 zoneNavItems**: 新增 Helper 工作台（`/dcr/helper`，仅 DCR_HELPER/ADMIN 可见）和 DCR 帖子（`/dcr/posts`）入口
   ```typescript
   const zoneNavItems: NavItem[] = [
     { href: "/psych", label: "心理区", icon: Heart, requirePsychAccess: true },
     { href: "/dcr/tickets", label: "工单列表", icon: Lock, requireDcrAccess: true },
     { href: "/dcr/helper", label: "Helper 工作台", icon: ShieldCheck, requireDcrAccess: true, minRole: "DCR_HELPER" },
     { href: "/dcr/posts", label: "DCR 帖子", icon: FileText, requireDcrAccess: true },
   ];
   ```

## Testing Strategy

### Validation Approach

测试策略分两阶段：首先在未修复代码上运行探索性测试以确认 Bug 存在和根因，然后在修复后验证正确性和行为保持。

### Exploratory Fault Condition Checking

**Goal**: 在实施修复前，通过测试用例复现 Bug，确认或否定根因分析。如果否定，需要重新假设。

**Test Plan**: 编写针对 GET /api/cases 查询逻辑、消息发送权限、帖子可见性的单元测试，在未修复代码上运行以观察失败模式。

**Test Cases**:
1. **查询冲突测试**: DCR_HELPER 用户筛选 `status=IN_PROGRESS`，验证是否能看到自己提交但由他人处理的工单（will fail on unfixed code）
2. **OPENED 消息测试**: 提交者在 OPENED 状态下尝试发送消息，验证 canSendMessage 返回值（will fail on unfixed code）
3. **帖子可见性测试**: 用户 A 参与工单 #1，验证是否能看到工单 #2 的帖子（will fail on unfixed code — 当前能看到所有 DCR 帖子）
4. **多人接单测试**: Helper B 尝试加入已有 Helper A 处理的工单（will fail on unfixed code）

**Expected Counterexamples**:
- 筛选 IN_PROGRESS 时，用户自己提交但由他人处理的工单不在结果中
- canSendMessage("OPENED") 返回 false
- 用户能看到不属于自己工单的 DCR 帖子
- Possible causes: Prisma AND/OR 语义冲突、canSendMessage 硬编码、Post 无 caseId、handlerId 单一字段

### Fix Checking

**Goal**: 验证所有 Bug 条件下，修复后的函数产生期望行为。

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

具体验证：
- 查询修复：任意 status 筛选 + 任意用户角色组合，结果集正确
- 消息修复：OPENED 状态提交者可发送，群组消息所有参与者可见
- 帖子修复：仅显示用户参与工单的关联帖子
- 多人互助：多个 Helper 可加入同一工单，上限 5 人

### Preservation Checking

**Goal**: 验证所有非 Bug 条件下，修复后的函数与原函数行为一致。

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: 属性测试（Property-Based Testing）推荐用于保持性检查，因为：
- 自动生成大量测试用例覆盖输入域
- 捕获手动单元测试可能遗漏的边界情况
- 对非 Bug 输入的行为不变性提供强保证

**Test Plan**: 先在未修复代码上观察 Admin 查询、状态机转换、CLOSED 消息禁止等行为，然后编写属性测试确保修复后这些行为不变。

**Test Cases**:
1. **Admin 查询保持**: 验证 Admin 用户在修复前后查询结果完全一致
2. **状态机保持**: 验证所有合法/非法状态转换在修复前后行为一致
3. **CLOSED 消息禁止保持**: 验证 CLOSED 状态下消息发送在修复前后均被拒绝
4. **匿名消息保持**: 验证消息 isAnonymous=true 在修复前后不变
5. **并发上限保持**: 验证 DCR_HELPER 5 个活跃工单上限在修复前后不变
6. **准入流程保持**: 验证 computeFlowStep 函数在修复前后输出一致

### Unit Tests

- 测试 GET /api/cases 在各种 status 筛选 + 角色组合下的查询结果
- 测试 PATCH /api/cases/[id] 的多人加入逻辑（加入、上限、权限）
- 测试 canSendMessage 在各状态 + isSubmitter 组合下的返回值
- 测试消息 API 的群组权限检查（CaseHandler 关联）
- 测试帖子查询的 caseId 筛选逻辑
- 测试侧边栏导航项的可见性规则

### Property-Based Tests

- 生成随机用户角色 + status 筛选组合，验证查询结果满足可见性规则
- 生成随机工单状态 + 参与者配置，验证消息发送权限正确
- 生成随机工单参与者集合，验证帖子可见性仅限参与者
- 生成随机状态转换序列，验证状态机规则不变

### Integration Tests

- 完整工单流程：创建→接单→多人加入→消息沟通→关闭
- 帖子创建与可见性：创建关联帖子→验证仅参与者可见
- 侧边栏导航：不同角色用户验证导航项显示
- 消息轮询：验证自动刷新机制在页面可见性变化时触发
