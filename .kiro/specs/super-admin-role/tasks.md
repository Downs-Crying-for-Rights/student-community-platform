# 任务列表：超级管理员角色

## 任务 1：Prisma Schema 与数据库迁移

- [x] 1.1 在 `prisma/schema.prisma` 的 `Role` 枚举中新增 `SUPER_ADMIN` 值
- [x] 1.2 生成并应用 Prisma 迁移文件
- [x] 1.3 更新 `src/app/api/admin/users/route.ts` 中的 Zod querySchema，在 role 枚举中新增 `SUPER_ADMIN`

## 任务 2：RBAC 引擎扩展

- [x] 2.1 在 `src/lib/rbac.ts` 中新增 `SUPER_ADMIN_PERMISSIONS` 权限集合（包含所有 Action）
- [x] 2.2 在 `ROLE_PERMISSIONS` 映射中添加 `SUPER_ADMIN` 条目
- [x] 2.3 在 `ROLE_LEVEL` 中添加 `SUPER_ADMIN: 4`
- [x] 2.4 在 `checkPermission` 函数中添加 SUPER_ADMIN 短路逻辑（`if (role === "SUPER_ADMIN") return true`）
- [x] 2.5 编写 RBAC 单元测试：SUPER_ADMIN 权限映射和层级检查（`src/lib/__tests__/rbac.test.ts`）
- [x] 2.6 [PBT] 编写属性测试：属性 1 - SUPER_ADMIN 通过所有 RBAC 权限检查
- [x] 2.7 [PBT] 编写属性测试：属性 2 - SUPER_ADMIN 满足所有角色等级要求
- [x] 2.8 [PBT] 编写属性测试：属性 4 - 现有角色向后兼容

## 任务 3：ABAC 引擎扩展

- [x] 3.1 在 `src/lib/abac.ts` 的 `evaluateABACPolicy` 函数开头添加 SUPER_ADMIN 短路逻辑
- [x] 3.2 在 `canCreatePost` 函数开头添加 SUPER_ADMIN 短路逻辑
- [x] 3.3 在 `canAccessZone` 函数开头添加 SUPER_ADMIN 短路逻辑
- [x] 3.4 编写 ABAC 单元测试：SUPER_ADMIN 绕过所有限制（`src/lib/__tests__/abac.test.ts`）
- [x] 3.5 [PBT] 编写属性测试：属性 3 - SUPER_ADMIN 绕过所有 ABAC 限制

## 任务 4：审计日志扩展

- [x] 4.1 在 `src/lib/audit.ts` 的 `AuditAction` 中新增 `SUPER_ADMIN_OVERRIDE` 操作类型

## 任务 5：角色变更 API 扩展

- [x] 5.1 在 `src/app/api/admin/users/[id]/role/route.ts` 的 Zod schema 中新增 `SUPER_ADMIN` 选项
- [x] 5.2 添加 SUPER_ADMIN 授予保护逻辑：仅 SUPER_ADMIN 可将用户角色设为 SUPER_ADMIN
- [x] 5.3 添加自降级保护逻辑：SUPER_ADMIN 不可降级自身角色
- [x] 5.4 SUPER_ADMIN 角色变更记录高优先级审计日志
- [x] 5.5 编写角色变更 API 单元测试（`src/app/api/admin/users/__tests__/role.test.ts`）
- [x] 5.6 [PBT] 编写属性测试：属性 8 - 非 SUPER_ADMIN 不可授予 SUPER_ADMIN 角色

## 任务 6：用户属性覆写 API

- [x] 6.1 创建 `src/app/api/admin/users/[id]/override/route.ts`，实现 PATCH 端点
- [x] 6.2 实现 Zod 请求体验证（reputationScore、violationCount、布尔属性、role）
- [x] 6.3 实现 SUPER_ADMIN 角色验证（非 SUPER_ADMIN 返回 403）
- [x] 6.4 实现字段更新逻辑和修改前后值记录
- [x] 6.5 实现审计日志记录（SUPER_ADMIN_OVERRIDE 操作类型，含前后值）
- [x] 6.6 编写覆写 API 单元测试（`src/app/api/admin/users/__tests__/override.test.ts`）
- [x] 6.7 [PBT] 编写属性测试：属性 5 - 属性覆写 API 正确应用变更
- [x] 6.8 [PBT] 编写属性测试：属性 6 - 覆写 API 仅限 SUPER_ADMIN 访问
- [x] 6.9 [PBT] 编写属性测试：属性 7 - 覆写操作审计日志完整性

## 任务 7：管理后台 UI 扩展

- [x] 7.1 在 `src/app/admin/users/page.tsx` 的 ROLES 常量中新增 `SUPER_ADMIN`
- [x] 7.2 添加当前用户角色状态获取逻辑（通过 session 或 API）
- [x] 7.3 实现 SUPER_ADMIN 专属用户属性编辑面板（reputationScore、violationCount、布尔开关）
- [x] 7.4 实现修改前后对比确认对话框
- [x] 7.5 对非 SUPER_ADMIN 用户隐藏专属编辑面板
- [x] 7.6 编写 UI 单元测试：条件渲染和交互（`src/app/admin/__tests__/users-page.test.ts`）
