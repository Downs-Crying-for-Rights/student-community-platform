# 需求文档：多方式登录

## 简介

为学生社区平台扩展认证系统，在现有邮箱魔法链接登录的基础上，新增账号密码登录、手机号验证码登录和 QQ 授权登录三种方式。所有登录方式在用户首次登录后，若未绑定手机号，须强制引导用户完成手机号绑定。验证码发送模块采用可插拔的 Provider 架构，测试环境使用固定验证码，生产环境可接入真实短信服务商。

## 术语表

- **Auth_System**：基于 NextAuth v4 的认证系统，负责管理所有登录方式和会话
- **Credentials_Provider**：NextAuth 的 CredentialsProvider，用于处理账号密码登录
- **SMS_Provider**：短信验证码发送服务的抽象接口，支持测试模式（固定验证码）和生产模式（真实短信服务商）
- **QQ_OAuth_Provider**：基于 OAuth 2.0 协议的 QQ 授权登录提供者
- **Email_Provider**：现有的邮箱魔法链接登录提供者（保留不变）
- **Phone_Binding_Guard**：登录后检查用户是否已绑定手机号的中间件守卫
- **Verification_Code**：6 位数字短信验证码，用于手机号登录和手机号绑定
- **Fixed_Test_Code**：测试环境下使用的固定验证码值（如 "888888"）
- **Phone_Binding_Page**：强制绑定手机号的页面，用户在未绑定手机号时被重定向至此

## 需求

### 需求 1：账号密码登录

**用户故事：** 作为学生用户，我希望使用用户名或邮箱加密码的方式登录，以便快速访问社区而无需等待邮件。

#### 验收标准

1. WHEN 用户在登录页面选择"账号密码登录"标签页，THE Auth_System SHALL 显示包含用户名/邮箱输入框和密码输入框的登录表单。
2. WHEN 用户提交有效的邮箱和正确的密码，THE Auth_System SHALL 验证凭据并创建用户会话，将用户重定向至首页。
3. WHEN 用户提交无效的邮箱格式或空密码，THE Auth_System SHALL 在表单中显示对应字段的校验错误提示，且不发送请求至服务端。
4. WHEN 用户提交的邮箱不存在或密码不匹配，THE Auth_System SHALL 返回统一的错误提示"邮箱或密码错误"，不泄露具体是哪个字段有误。
5. THE Auth_System SHALL 使用 bcrypt 算法（cost factor ≥ 10）对用户密码进行哈希存储。
6. WHEN 用户尚未设置密码（仅通过邮箱魔法链接注册的用户），THE Auth_System SHALL 在用户个人设置页面提供"设置密码"功能。

### 需求 2：手机号验证码登录

**用户故事：** 作为学生用户，我希望使用手机号和短信验证码登录，以便在没有邮箱的情况下也能使用社区。

#### 验收标准

1. WHEN 用户在登录页面选择"手机号登录"标签页，THE Auth_System SHALL 显示包含手机号输入框、验证码输入框和"发送验证码"按钮的登录表单。
2. WHEN 用户输入有效的中国大陆手机号（11 位，以 1 开头）并点击"发送验证码"，THE SMS_Provider SHALL 向该手机号发送一个 6 位数字验证码。
3. WHEN 验证码发送成功，THE Auth_System SHALL 启动 60 秒倒计时，在倒计时期间禁用"发送验证码"按钮并显示剩余秒数。
4. WHEN 用户提交正确的手机号和验证码，THE Auth_System SHALL 验证凭据并创建用户会话；若该手机号对应的用户不存在，THE Auth_System SHALL 自动创建新用户。
5. WHEN 用户提交错误的验证码，THE Auth_System SHALL 返回错误提示"验证码错误或已过期"。
6. THE Verification_Code SHALL 在 5 分钟后过期失效。
7. THE Auth_System SHALL 将验证码存储在 Redis 中，key 格式为 `sms:login:{phone}`，并设置 300 秒 TTL。
8. WHILE 测试环境（环境变量 `SMS_TEST_MODE=true`），THE SMS_Provider SHALL 跳过真实短信发送，使用固定验证码 "888888"。
9. WHILE 生产环境（环境变量 `SMS_TEST_MODE` 未设置或为 false），THE SMS_Provider SHALL 通过可配置的短信服务商接口发送验证码。

### 需求 3：QQ 授权登录

**用户故事：** 作为学生用户，我希望使用 QQ 账号一键授权登录，以便利用已有的社交账号快速进入社区。

#### 验收标准

1. WHEN 用户在登录页面点击"QQ 登录"按钮，THE Auth_System SHALL 将用户重定向至 QQ OAuth 2.0 授权页面。
2. WHEN QQ 授权成功并回调，THE QQ_OAuth_Provider SHALL 使用 QQ 返回的 openid 查找或创建关联的用户账户，并创建用户会话。
3. WHEN QQ 授权成功且该 QQ openid 首次登录，THE Auth_System SHALL 自动创建新用户，并将 QQ 账号信息存储在 Account 表中（provider 为 "qq"）。
4. WHEN QQ 授权成功且该 QQ openid 已关联现有用户，THE Auth_System SHALL 直接登录该用户。
5. IF QQ 授权过程中发生错误（用户取消授权或网络异常），THEN THE Auth_System SHALL 将用户重定向回登录页面并显示错误提示"QQ 授权失败，请重试"。
6. THE QQ_OAuth_Provider SHALL 从环境变量读取 QQ_APP_ID 和 QQ_APP_SECRET 配置。

### 需求 4：保留现有邮箱魔法链接登录

**用户故事：** 作为现有用户，我希望继续使用邮箱魔法链接登录，以保持原有的登录体验不受影响。

#### 验收标准

1. THE Email_Provider SHALL 保持现有的邮箱魔法链接登录功能不变，包括 15 分钟有效期和邮件模板。
2. THE Auth_System SHALL 在登录页面将邮箱魔法链接登录作为可选标签页之一展示。
3. WHEN 现有用户使用邮箱魔法链接登录，THE Auth_System SHALL 正常创建会话，现有的用户数据和关联关系保持不变。

### 需求 5：登录后强制绑定手机号

**用户故事：** 作为平台运营方，我希望所有用户在登录后绑定手机号，以便在必要时进行身份验证和安全通知。

#### 验收标准

1. WHEN 用户登录成功且该用户的 phone 字段为空，THE Phone_Binding_Guard SHALL 将用户重定向至手机号绑定页面（/bindphone）。
2. WHILE 用户处于手机号绑定页面，THE Auth_System SHALL 显示手机号输入框、验证码输入框和"发送验证码"按钮。
3. WHEN 用户在绑定页面提交有效手机号并点击"发送验证码"，THE SMS_Provider SHALL 向该手机号发送 6 位数字验证码。
4. WHEN 用户提交正确的手机号和验证码，THE Auth_System SHALL 将手机号保存至用户的 phone 字段，并将用户重定向至原目标页面或首页。
5. WHEN 用户提交的手机号已被其他用户绑定，THE Auth_System SHALL 返回错误提示"该手机号已被其他账户绑定"。
6. THE Phone_Binding_Guard SHALL 允许用户访问 /api/auth、/api/sms、/bindphone 和 /logout 路径而不触发重定向。
7. WHILE 用户未完成手机号绑定，THE Phone_Binding_Guard SHALL 拦截所有其他页面请求并重定向至 /bindphone。
8. WHEN 用户通过手机号验证码登录方式登录，THE Auth_System SHALL 视该手机号为已绑定，跳过强制绑定流程。

### 需求 6：验证码服务可扩展架构

**用户故事：** 作为开发者，我希望验证码发送服务采用可插拔架构，以便在测试和生产环境间切换，并在未来接入不同的短信服务商。

#### 验收标准

1. THE SMS_Provider SHALL 定义统一的接口（interface），包含 `sendCode(phone: string, code: string): Promise<boolean>` 方法。
2. THE Auth_System SHALL 提供至少两个 SMS_Provider 实现：TestSmsProvider（返回固定验证码）和 ProductionSmsProvider（调用外部短信 API）。
3. WHEN 环境变量 `SMS_TEST_MODE=true`，THE Auth_System SHALL 自动选择 TestSmsProvider。
4. WHEN 环境变量 `SMS_TEST_MODE` 未设置或为 false，THE Auth_System SHALL 自动选择 ProductionSmsProvider。
5. THE SMS_Provider SHALL 对同一手机号实施发送频率限制：60 秒内同一手机号仅允许发送 1 次验证码。
6. IF 用户在 60 秒内重复请求发送验证码，THEN THE SMS_Provider SHALL 返回错误提示"请求过于频繁，请稍后再试"。
7. THE Verification_Code SHALL 为 6 位纯数字字符串，由安全随机数生成器生成。

### 需求 7：登录页面 UI 整合

**用户故事：** 作为学生用户，我希望在一个统一的登录页面上看到所有可用的登录方式，以便选择最方便的方式登录。

#### 验收标准

1. THE Auth_System SHALL 在登录页面以标签页（Tab）形式展示以下登录方式：邮箱登录、账号密码登录、手机号登录。
2. THE Auth_System SHALL 在标签页下方以分隔线和图标按钮形式展示第三方登录选项（QQ 登录）。
3. THE Auth_System SHALL 保留现有的邀请码注册入口。
4. WHEN 用户切换登录方式标签页，THE Auth_System SHALL 清空前一个标签页的表单输入和错误提示。
5. THE Auth_System SHALL 确保登录页面在移动端和桌面端均可正常使用，表单元素可通过键盘导航和屏幕阅读器访问。

### 需求 8：数据库 Schema 扩展

**用户故事：** 作为开发者，我需要扩展数据库模型以支持密码存储和手机号字段，同时保持与现有数据的兼容性。

#### 验收标准

1. THE Auth_System SHALL 在 User 模型中新增 `phone` 字段（String，可选，唯一约束）用于存储用户手机号。
2. THE Auth_System SHALL 在 User 模型中新增 `passwordHash` 字段（String，可选）用于存储 bcrypt 哈希后的密码。
3. THE Auth_System SHALL 确保新增字段为可选字段，现有用户数据无需迁移即可正常使用。
4. THE Auth_System SHALL 对 phone 字段添加唯一索引，确保同一手机号仅能绑定一个用户。
