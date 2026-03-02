# Implementation Plan: 多方式登录 (Multi-Auth Login)

## Overview

在现有 NextAuth v4 邮箱魔法链接登录基础上，扩展认证系统支持账号密码登录、手机号验证码登录和 QQ 授权登录。核心变更包括：会话策略从 database 切换为 JWT、新增 CredentialsProvider、自定义 QQ OAuth Provider、SMS 验证码服务（Redis 存储）、手机号绑定守卫中间件、登录页面 Tab 重构。

## Tasks

- [x] 1. 数据库 Schema 扩展与 Zod 验证器
  - [x] 1.1 扩展 Prisma User 模型，新增 phone 和 passwordHash 字段
    - 在 `prisma/schema.prisma` 的 User 模型中新增 `phone String? @unique` 和 `passwordHash String?` 字段
    - 运行 `npx prisma generate` 更新 Prisma Client
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.2 新增 Zod 验证 Schema
    - 在 `src/lib/validators.ts` 中新增 `phoneSchema`、`verificationCodeSchema`、`passwordSchema`、`loginPasswordSchema`、`loginSmsSchema`、`sendCodeSchema`、`bindPhoneSchema`、`setPasswordSchema`
    - 手机号格式：`/^1\d{10}$/`（中国大陆 11 位）；验证码：`/^\d{6}$/`；密码：8-72 字符
    - _Requirements: 1.3, 2.1, 5.2_

  - [x] 1.3 Write property test for 无效登录输入拒绝
    - **Property 2: 无效登录输入拒绝**
    - 使用 fast-check 生成随机无效邮箱和空密码字符串，验证 loginPasswordSchema 拒绝无效输入
    - 测试文件：`src/lib/__tests__/auth.property.test.ts`
    - **Validates: Requirements 1.3**

- [x] 2. SMS 验证码服务
  - [x] 2.1 创建 SMS Provider 接口与实现
    - 创建 `src/lib/sms/types.ts` 定义 `SmsProvider` 接口（`sendCode(phone, code): Promise<boolean>`）
    - 创建 `src/lib/sms/test-provider.ts` 实现 `TestSmsProvider`（console.log 输出，返回 true）
    - 创建 `src/lib/sms/production-provider.ts` 实现 `ProductionSmsProvider`（调用外部 API 占位）
    - 创建 `src/lib/sms/index.ts` 导出 `getSmsProvider()` 根据 `SMS_TEST_MODE` 环境变量选择 provider
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 2.2 Write property test for SMS Provider 环境选择
    - **Property 8: SMS Provider 环境选择**
    - 验证 SMS_TEST_MODE=true 返回 TestSmsProvider，否则返回 ProductionSmsProvider
    - 测试文件：`src/lib/sms/__tests__/provider.test.ts`
    - **Validates: Requirements 6.3, 6.4**

  - [x] 2.3 实现验证码生成、存储与校验服务
    - 创建 `src/lib/sms/verification.ts`，实现：
      - `generateCode()`: 使用 crypto.randomInt 生成 6 位安全随机数字
      - `sendVerificationCode(phone, purpose)`: 检查频率限制（Redis `sms:limit:{phone}` 60s TTL），生成/存储验证码（Redis `sms:{purpose}:{phone}` 300s TTL），测试模式下使用固定码 "888888"
      - `verifyCode(phone, code, purpose)`: 从 Redis 读取并比对验证码，成功后删除
    - _Requirements: 2.2, 2.6, 2.7, 2.8, 2.9, 6.5, 6.6, 6.7_

  - [x] 2.4 Write property tests for 验证码服务
    - **Property 4: 验证码格式** — generateCode() 结果匹配 `/^\d{6}$/`
    - **Property 5: 验证码存储与验证 Round-Trip** — 存储后用正确码验证返回 true
    - **Property 6: 错误验证码拒绝** — 用不同码验证返回 false
    - **Property 7: 测试模式固定验证码** — SMS_TEST_MODE=true 时固定为 "888888"
    - **Property 9: 验证码发送频率限制** — 60 秒内第二次调用返回频率限制错误
    - 测试文件：`src/lib/sms/__tests__/verification.property.test.ts`
    - **Validates: Requirements 2.2, 2.4, 2.5, 2.7, 2.8, 6.5, 6.7**

  - [x] 2.5 创建发送验证码 API 路由
    - 创建 `src/app/api/sms/send/route.ts`，POST 接口接收 `{ phone, purpose }` 参数
    - 使用 sendCodeSchema 验证输入，调用 sendVerificationCode 服务
    - 返回 `{ success: true }` 或错误响应（429 频率限制、500 发送失败）
    - _Requirements: 2.2, 2.3, 5.3, 6.5, 6.6_

  - [x] 2.6 Write unit tests for 发送验证码 API
    - 测试成功发送、频率限制拒绝、无效手机号拒绝
    - 测试文件：`src/app/api/sms/send/__tests__/route.test.ts`
    - _Requirements: 2.2, 6.5, 6.6_

- [x] 3. Checkpoint - 验证码服务验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. NextAuth 配置扩展
  - [x] 4.1 切换会话策略为 JWT 并调整回调
    - 修改 `src/lib/auth.ts`：将 `session.strategy` 从 `"database"` 改为 `"jwt"`
    - 实现 `jwt` callback：在用户首次登录时将 `id`、`role`、`phone` 注入 token
    - 实现 `session` callback：从 token 读取用户信息填充 session
    - 扩展 NextAuth 类型声明（JWT 和 Session 接口）
    - _Requirements: 4.1, 4.3_

  - [x] 4.2 新增账号密码 CredentialsProvider
    - 在 `src/lib/auth.ts` 中添加 `CredentialsProvider`（id: `"credentials-password"`）
    - authorize 逻辑：通过邮箱查找用户 → bcrypt.compare 验证密码 → 返回用户或 null
    - 错误消息统一为 "邮箱或密码错误"，不区分邮箱不存在或密码错误
    - _Requirements: 1.2, 1.4, 1.5_

  - [x] 4.3 Write property tests for 密码认证
    - **Property 1: 密码哈希 Round-Trip** — bcrypt 哈希后 compare 返回 true，格式以 `$2b$` 开头且 cost ≥ 10
    - **Property 3: 统一错误提示不泄露信息** — 不存在邮箱或错误密码返回相同错误消息
    - 测试文件：`src/lib/__tests__/auth.property.test.ts`
    - **Validates: Requirements 1.2, 1.4, 1.5**

  - [x] 4.4 新增手机号验证码 CredentialsProvider
    - 在 `src/lib/auth.ts` 中添加 `CredentialsProvider`（id: `"credentials-sms"`）
    - authorize 逻辑：调用 verifyCode 验证 → 通过手机号查找或创建用户 → 返回用户
    - 手机号登录的用户 phone 字段自动填充，跳过后续绑定流程
    - _Requirements: 2.4, 5.8_

  - [x] 4.5 Write property test for 手机号登录隐含已绑定
    - **Property 11: 手机号登录隐含已绑定**
    - 验证通过手机号登录后 JWT token 中 phone 字段等于登录手机号
    - 测试文件：`src/lib/__tests__/auth.property.test.ts`
    - **Validates: Requirements 5.8**

  - [x] 4.6 创建自定义 QQ OAuth Provider
    - 创建 `src/lib/auth/qq-provider.ts`，实现自定义 NextAuth OAuth Provider
    - 配置 QQ OAuth 2.0 端点（authorize、token、userinfo）
    - 处理 QQ 非标准 token 响应格式（callback 格式解析）
    - 从环境变量读取 QQ_APP_ID 和 QQ_APP_SECRET
    - profile 回调：解析 openid、nickname、头像 URL
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

  - [x] 4.7 Write unit tests for QQ Provider 和 NextAuth 配置
    - 测试 QQ Provider 端点配置、profile 解析、token 解析
    - 测试密码登录 authorize：正确密码、错误密码、不存在邮箱
    - 测试手机号登录 authorize：正确验证码、错误验证码、自动创建用户
    - 测试文件：`src/lib/__tests__/auth.test.ts`（扩展现有测试）
    - _Requirements: 3.1, 3.2, 3.6, 1.2, 1.4, 2.4, 2.5_

- [x] 5. Checkpoint - 认证配置验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. 手机号绑定守卫与 API
  - [x] 6.1 扩展中间件实现 Phone Binding Guard
    - 修改 `src/middleware.ts`，在现有认证检查后增加手机号绑定检查
    - 从 JWT token 读取 phone 字段，为空时重定向至 `/bindphone`
    - 白名单路径：`/api/auth`、`/api/sms`、`/bindphone`、`/logout`、`/login` 不触发重定向
    - 更新 matcher 配置，将 `/bindphone` 加入受保护路由
    - _Requirements: 5.1, 5.6, 5.7_

  - [x] 6.2 Write property test for 手机号绑定守卫路由规则
    - **Property 10: 手机号绑定守卫路由规则**
    - 使用 fast-check 生成随机路径，验证白名单放行、非白名单重定向
    - 测试文件：`src/lib/__tests__/phone-binding-guard.property.test.ts`
    - **Validates: Requirements 5.1, 5.6, 5.7**

  - [x] 6.3 创建手机号绑定 API
    - 创建 `src/app/api/auth/bindphone/route.ts`，POST 接口接收 `{ phone, code }`
    - 验证已登录状态（从 JWT 获取 userId）→ 调用 verifyCode → 检查手机号唯一性 → 更新 User.phone
    - 手机号已被占用时返回 409 "该手机号已被其他账户绑定"
    - _Requirements: 5.4, 5.5_

  - [x] 6.4 Write property tests for 手机号绑定
    - **Property 12: 手机号唯一性约束** — 已绑定手机号被其他用户绑定时失败
    - **Property 14: 手机号绑定 Round-Trip** — 绑定后查询 phone 字段等于提交值
    - 测试文件：`src/app/api/auth/bindphone/__tests__/route.test.ts`
    - **Validates: Requirements 5.4, 5.5**

  - [x] 6.5 创建密码设置 API
    - 创建 `src/app/api/auth/password/route.ts`，POST 接口接收 `{ password }`
    - 验证已登录状态 → 检查 passwordHash 为空 → bcrypt 哈希（cost ≥ 10）→ 更新 User.passwordHash
    - 已有密码时拒绝设置
    - _Requirements: 1.5, 1.6_

  - [x] 6.6 Write unit tests for 密码设置 API
    - 测试成功设置、已有密码拒绝、未登录拒绝
    - 测试文件：`src/app/api/auth/password/__tests__/route.test.ts`
    - _Requirements: 1.5, 1.6_

- [x] 7. Checkpoint - 后端 API 验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. 登录页面 UI 重构
  - [x] 8.1 重构登录页面为 Tab 切换模式
    - 修改 `src/app/(auth)/login/page.tsx`，将现有邮箱登录改为 Tab 组件
    - Tab 1: 邮箱登录（保留现有魔法链接逻辑）
    - Tab 2: 账号密码登录（邮箱 + 密码表单，调用 `signIn("credentials-password")`)
    - Tab 3: 手机号登录（手机号 + 验证码表单 + 60 秒倒计时按钮，调用 `signIn("credentials-sms")`)
    - 分隔线下方: QQ 登录图标按钮（调用 `signIn("qq")`）
    - 保留邀请码注册入口
    - Tab 切换时清空前一个标签页的表单输入和错误提示
    - 确保移动端和桌面端响应式布局，支持键盘导航和屏幕阅读器
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 1.1, 1.2, 1.3, 2.1, 2.3, 3.1, 3.5_

  - [x] 8.2 Write property test for 标签页切换清空表单状态
    - **Property 13: 标签页切换清空表单状态**
    - 验证切换 Tab 后前一个标签页的表单值和错误提示被清空
    - 测试文件：`src/app/(auth)/login/__tests__/login-page.test.ts`
    - **Validates: Requirements 7.4**

  - [x] 8.3 Write unit tests for 登录页面
    - 测试 Tab 渲染、表单提交、错误显示、QQ 登录按钮、邀请码入口
    - 测试文件：`src/app/(auth)/login/__tests__/login-page.test.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 9. 手机号绑定页面
  - [x] 9.1 创建手机号绑定页面
    - 创建 `src/app/(auth)/bindphone/page.tsx`
    - 包含手机号输入框、验证码输入框、发送验证码按钮（60 秒倒计时）
    - 提交后调用 `/api/auth/bindphone`，成功后重定向至原目标页面或首页
    - 显示错误提示（手机号已被绑定、验证码错误等）
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

  - [x] 9.2 Write unit tests for 手机号绑定页面
    - 测试表单渲染、验证码发送、提交绑定、错误显示
    - 测试文件：`src/app/(auth)/bindphone/__tests__/bindphone-page.test.ts`
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [x] 10. 集成与收尾
  - [x] 10.1 在设置页面添加"设置密码"功能入口
    - 修改 `src/app/settings/profile/page.tsx`，为 passwordHash 为空的用户显示"设置密码"表单
    - 调用 `/api/auth/password` API
    - _Requirements: 1.6_

  - [x] 10.2 添加环境变量配置
    - 在 `.env` 中添加 `QQ_APP_ID`、`QQ_APP_SECRET`、`SMS_TEST_MODE=true` 占位配置
    - 确保 `REDIS_URL` 已配置（现有）
    - _Requirements: 3.6, 2.8, 2.9_

  - [x] 10.3 生成 Prisma 迁移并验证
    - 运行 `npx prisma migrate dev --name add-phone-password` 生成迁移文件
    - 验证迁移不影响现有数据（新字段均为可选）
    - _Requirements: 8.3_

- [x] 11. Final checkpoint - 全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (Property 1-14 from design)
- Unit tests validate specific examples and edge cases
- 所有代码使用 TypeScript，测试使用 vitest + fast-check
- Redis 客户端复用现有 `src/lib/redis.ts` 模块
