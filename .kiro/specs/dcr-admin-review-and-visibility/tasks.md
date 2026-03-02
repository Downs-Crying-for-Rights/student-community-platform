# Tasks

## 1. Bug 3 修复：Cases API 权限放宽（优先级最高，阻塞流程）
- [x] 1.1 修改 `src/app/api/cases/route.ts` GET handler：对非 ADMIN 且无 dcrAccess 的用户，不返回 403，改为强制 `where.submitterId = userId` 只查询自己的 Case
- [x] 1.2 编写单元测试：无 dcrAccess 用户调用 GET /api/cases 返回自己提交的 Case（非 403）
- [x] 1.3 编写单元测试：无 dcrAccess 且无 Case 的用户调用 GET /api/cases 返回空列表
- [x] 1.4 编写保持性测试：有 dcrAccess 用户调用 GET /api/cases 返回结果不变
- [x] 1.5 编写保持性测试：未登录用户调用 GET /api/cases 返回 401
- [x] 1.6 [PBT-exploration] 属性测试：生成随机 (dcrAccess, role, hasCase) 组合，验证 GET /api/cases 对所有组合返回正确响应（非 bug 条件下行为不变）

## 2. Bug 2 修复：侧边栏 DCR 入口逻辑
- [x] 2.1 修改 `src/components/layout/Sidebar.tsx` 中 `zoneNavItems`：将 `/dcr` 入口改为 `/dcr/tickets`（label 改为「DCR 互助区」），移除 `/dcr/posts` 条目
- [x] 2.2 编写单元测试：dcrAccess=true 时侧边栏显示「DCR 互助区」链接（href=/dcr/tickets）
- [x] 2.3 编写单元测试：dcrAccess=false 时侧边栏不显示任何 DCR 导航项
- [x] 2.4 编写保持性测试：psychAccess=true 时侧边栏继续显示「心理区」导航项

## 3. Bug 1 修复：管理员审核页面展示委托表详情
- [x] 3.1 修改 `src/app/api/admin/applications/route.ts` GET handler：对 DCR 类型申请，通过 applicantId 关联查询最近的 Case 记录，在返回数据中附加 relatedCase（含 formData、pledgeText、category、status）
- [x] 3.2 修改 `src/app/admin/applications/page.tsx`：扩展 ApplicationItem 接口添加 relatedCase 字段，在表格每行添加展开/收起详情区域展示 formData 字段和 pledgeText
- [x] 3.3 编写单元测试：GET /api/admin/applications?type=DCR 返回的申请包含 relatedCase.formData
- [x] 3.4 编写单元测试：管理员页面渲染时展开详情区域显示学校名称、行为描述等字段
- [x] 3.5 编写保持性测试：GET /api/admin/applications 的现有字段（id, type, status, applicant 等）不受影响
