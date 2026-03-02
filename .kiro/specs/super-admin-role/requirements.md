# 需求文档：超级管理员角色

## 简介

为学生社区平台新增 SUPER_ADMIN（超级管理员）角色。该角色拥有系统最高权限，可绕过所有 RBAC 和 ABAC 限制，执行任意操作并修改系统中的任何数值。超级管理员的所有操作均需记录审计日志，以确保可追溯性。

## 术语表

- **RBAC_Engine**: 基于角色的访问控制引擎，位于 `src/lib/rbac.ts`，负责根据用户角色判断操作权限
- **ABAC_Engine**: 基于属性的访问控制引擎，位于 `src/lib/abac.ts`，负责根据用户属性（账号年龄、违规次数等）计算动态限制
- **Super_Admin**: 拥有系统最高权限的角色，可绕过所有权限检查
- **Auth_Middleware**: API 路由鉴权中间件 `withAuth`，负责验证用户身份和角色等级
- **Audit_Logger**: 审计日志记录器，位于 `src/lib/audit.ts`，负责记录所有敏感操作
- **Role_Enum**: Prisma 数据模型中的角色枚举，当前包含 USER、TRUSTED_USER、DCR_HELPER、MODERATOR、ADMIN
- **Override_Action**: 超级管理员对用户属性或系统数值的直接修改操作

## 需求

### 需求 1：角色定义

**用户故事：** 作为平台运营者，我希望系统中存在一个 SUPER_ADMIN 角色，以便拥有超越所有现有角色的最高权限。

#### 验收标准

1. THE Role_Enum SHALL 包含 SUPER_ADMIN 作为一个独立的角色值
2. WHEN SUPER_ADMIN 角色被添加到 Role_Enum 时，THE Role_Enum SHALL 保持与现有角色（USER、TRUSTED_USER、DCR_HELPER、MODERATOR、ADMIN）的向后兼容性
3. THE RBAC_Engine SHALL 将 SUPER_ADMIN 的角色等级设为高于 ADMIN（数值等级 = 4）

### 需求 2：RBAC 权限绕过

**用户故事：** 作为超级管理员，我希望自动拥有系统中所有已定义的操作权限，以便无需逐一授权即可执行任何操作。

#### 验收标准

1. WHEN RBAC_Engine 对 SUPER_ADMIN 角色执行权限检查时，THE RBAC_Engine SHALL 对所有 Action 类型返回允许（true）
2. WHEN Auth_Middleware 对 SUPER_ADMIN 用户执行角色等级检查时，THE Auth_Middleware SHALL 对任意 requiredRole 参数返回通过
3. THE RBAC_Engine SHALL 在 ROLE_PERMISSIONS 映射中为 SUPER_ADMIN 包含所有已定义的 Action

### 需求 3：ABAC 限制绕过

**用户故事：** 作为超级管理员，我希望不受账号年龄、违规次数、新手期等属性限制的约束，以便自由执行所有操作。

#### 验收标准

1. WHEN ABAC_Engine 对 SUPER_ADMIN 角色的用户评估策略时，THE ABAC_Engine SHALL 返回无限制的策略结果（maxDailyPosts 为 null、canAccessPrivateZone 为 true、canSendDM 为 true、restrictions 为空数组）
2. WHEN ABAC_Engine 对 SUPER_ADMIN 角色的用户执行发帖检查时，THE ABAC_Engine SHALL 始终返回 allowed: true
3. WHEN ABAC_Engine 对 SUPER_ADMIN 角色的用户执行区域访问检查时，THE ABAC_Engine SHALL 对所有区域（PUBLIC、PSYCHOLOGY、DCR）返回 allowed: true

### 需求 4：数值修改能力

**用户故事：** 作为超级管理员，我希望能够直接修改用户的任意属性值（如信誉分、违规次数、准入权限等），以便进行破格操作。

#### 验收标准

1. THE Super_Admin SHALL 能够通过管理后台 API 修改任意用户的 reputationScore 字段
2. THE Super_Admin SHALL 能够通过管理后台 API 修改任意用户的 violationCount 字段
3. THE Super_Admin SHALL 能够通过管理后台 API 修改任意用户的布尔属性（psychAccess、dcrAccess、dcrPledgeSigned、quizPassed、onboardingDone）
4. THE Super_Admin SHALL 能够通过管理后台 API 修改任意用户的 role 字段（包括将用户提升为 SUPER_ADMIN）
5. WHEN Super_Admin 修改用户属性时，THE Auth_Middleware SHALL 验证操作者角色为 SUPER_ADMIN

### 需求 5：审计日志

**用户故事：** 作为平台运营者，我希望超级管理员的所有操作都被完整记录，以便事后审计和追溯。

#### 验收标准

1. WHEN Super_Admin 执行任何 Override_Action 时，THE Audit_Logger SHALL 记录一条包含操作者 ID、操作类型、目标对象、修改前后值的审计日志
2. THE Audit_Logger SHALL 新增 SUPER_ADMIN_OVERRIDE 审计操作类型，用于标识超级管理员的破格操作
3. WHEN Super_Admin 修改用户角色时，THE Audit_Logger SHALL 在详情中记录原角色和新角色

### 需求 6：管理后台界面

**用户故事：** 作为超级管理员，我希望在管理后台中看到用户属性的完整编辑界面，以便直观地修改任何数值。

#### 验收标准

1. WHEN 具有 SUPER_ADMIN 角色的用户访问管理后台用户详情页时，THE 管理后台 SHALL 显示所有可编辑的用户属性字段（reputationScore、violationCount、psychAccess、dcrAccess、dcrPledgeSigned、quizPassed、onboardingDone、role）
2. WHEN 不具有 SUPER_ADMIN 角色的管理员访问管理后台用户详情页时，THE 管理后台 SHALL 隐藏超级管理员专属的编辑字段
3. WHEN Super_Admin 提交属性修改表单时，THE 管理后台 SHALL 显示修改前后的数值对比确认对话框

### 需求 7：安全约束

**用户故事：** 作为平台运营者，我希望超级管理员角色的授予受到严格控制，以防止权限滥用。

#### 验收标准

1. THE 系统 SHALL 仅允许 SUPER_ADMIN 角色的用户将其他用户提升为 SUPER_ADMIN
2. IF 非 SUPER_ADMIN 用户尝试将其他用户角色设为 SUPER_ADMIN，THEN THE Auth_Middleware SHALL 返回 403 权限不足错误
3. WHEN Super_Admin 将用户角色修改为 SUPER_ADMIN 时，THE Audit_Logger SHALL 记录一条高优先级审计日志
4. THE 系统 SHALL 禁止 SUPER_ADMIN 用户降级自身角色（防止系统中无超级管理员）
