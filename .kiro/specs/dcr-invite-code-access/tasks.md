# 实施计划：邀请码注册完整身份信息 + DCR 自动准入

## 概述

改造现有邀请码注册路由 `POST /api/auth/invite`，从创建匿名用户升级为要求完整身份信息（email、password、phone + 短信验证码），注册成功后自动授予 DCR 访问权限。实现参照现有 `POST /api/auth/register` 路由模式，复用 `registerSchema` 相同的校验规则和 `verifyCode` 短信验证。使用 TypeScript，测试框架为 vitest + fast-check。

## Tasks

- [x] 1. 创建邀请码注册专用 Zod Schema
  - [x] 1.1 在 `src/lib/validators.ts` 中新增 `inviteRegisterSchema`
    - 复合 schema 包含：`inviteCode`（inviteCodeSchema）、`email`（emailSchema）、`password`（passwordSchema）、`phone`（phoneSchema）、`code`（verificationCodeSchema）
    - 复用现有的 emailSchema、passwordSchema、phoneSchema、verificationCodeSchema 校验规则
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 编写 inviteRegisterSchema 单元测试
    - 在 `src/lib/__tests__/validators-invite.test.ts` 中测试缺少各字段时校验失败
    - 测试所有字段合法时校验通过
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. 改造邀请码注册路由
  - [x] 2.1 修改 `src/app/api/auth/invite/route.ts` POST handler，使用 `inviteRegisterSchema` 替换原有的 `inviteCodeSchema` 校验
    - 解析请求体后提取 inviteCode、email、password、phone、code 五个字段
    - 校验失败时返回 400 + "参数校验失败"
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 在邀请码验证通过后、事务之前，添加邮箱/手机号唯一性检查和短信验证码校验
    - 查询 `prisma.user.findUnique({ where: { email } })` 检查邮箱是否已注册，已注册返回 409 + "该邮箱已被注册"
    - 查询 `prisma.user.findFirst({ where: { phone } })` 检查手机号是否已绑定，已绑定返回 409 + "该手机号已被其他账户绑定"
    - 调用 `verifyCode(phone, code, "login")` 验证短信验证码，失败返回 400 + "验证码错误或已过期"
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.3 修改事务内用户创建逻辑
    - 使用 `bcrypt.hash(password, 10)` 对密码进行哈希处理
    - 创建用户时设置 `email`、`passwordHash`、`phone`、`isAnonymous: false`、`dcrAccess: true`
    - 保持邀请码状态更新和会话创建逻辑不变
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 6.1_

- [x] 3. Checkpoint — 确保路由改造编译通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 4. 更新邀请码注册路由测试
  - [x] 4.1 更新 `src/app/api/auth/invite/__tests__/route.test.ts`，适配新的请求体格式
    - 更新 mock：新增 bcryptjs mock、verifyCode mock、prisma.user.findUnique/findFirst mock
    - 更新 `createRequest` helper 和 `validBody` 常量，包含 inviteCode、email、password、phone、code 五个字段
    - 更新现有邀请码格式验证测试用例，使用新的请求体格式
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.2 新增身份信息校验测试用例
    - 测试缺少 email 返回 400 + "参数校验失败"
    - 测试缺少 password 返回 400 + "参数校验失败"
    - 测试缺少 phone 返回 400 + "参数校验失败"
    - 测试缺少短信验证码 code 返回 400 + "参数校验失败"
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 4.3 新增唯一性检查和短信验证测试用例
    - 测试邮箱已注册返回 409 + "该邮箱已被注册"
    - 测试手机号已绑定返回 409 + "该手机号已被其他账户绑定"
    - 测试短信验证码错误返回 400 + "验证码错误或已过期"
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.4 更新成功注册流程测试用例
    - 验证用户创建时 `isAnonymous: false`、`dcrAccess: true`、`email`、`passwordHash`、`phone` 均正确设置
    - 验证 bcrypt.hash 被调用
    - 验证事务中用户创建、邀请码更新、会话创建三个操作均执行
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 6.1, 6.2_

  - [x] 4.5 编写邀请码注册属性测试 `src/app/api/auth/invite/__tests__/invite-register.property.test.ts`
    - 使用 fast-check 生成随机合法/非法输入
    - 属性：任何缺少必填字段的请求体均返回 400
    - 属性：有效邀请码 + 完整身份信息 → 创建的用户 dcrAccess=true 且 isAnonymous=false
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2_

- [x] 5. 最终 Checkpoint — 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户确认。

## Notes

- 标记 `*` 的任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 改造基于现有 `POST /api/auth/register` 路由模式，复用相同的校验规则和验证逻辑
- 无需修改 Prisma Schema，`User.dcrAccess` 布尔字段已存在
- 事务一致性保持不变，仅扩展事务内用户创建的数据字段
