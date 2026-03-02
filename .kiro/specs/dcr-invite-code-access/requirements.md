# 需求文档

## 简介

增强现有邀请码注册流程，使通过邀请码注册的用户在注册时必须提供完整的身份信息（邮箱/昵称、密码、手机号），并在注册成功后自动获得 DCR 区域访问权限（`dcrAccess=true`）。当前邀请码注册仅创建匿名用户，本功能将其升级为完整注册流程并附带 DCR 准入。

## 术语表

- **Invite_Registration_API**: 邀请码注册接口，位于 `POST /api/auth/invite`，负责验证邀请码并创建用户账号
- **InviteCode**: 邀请码数据模型，包含 code、isUsed、isRevoked、expiresAt 等字段
- **User**: 用户数据模型，包含 email、nickname、passwordHash、phone、dcrAccess 等字段
- **DCR_Access**: 用户模型中的 `dcrAccess` 布尔字段，控制用户是否可以访问 DCR 区域
- **SMS_Verification**: 短信验证服务，用于验证手机号归属

## 需求

### 需求 1：邀请码注册必须提供完整身份信息

**用户故事：** 作为平台管理员，我希望通过邀请码注册的用户必须提供邮箱、密码和手机号，以确保每个邀请码注册的用户都有可追溯的身份信息。

#### 验收标准

1. WHEN 用户通过邀请码注册时未提供 email 字段，THE Invite_Registration_API SHALL 返回 400 错误并提示"参数校验失败"
2. WHEN 用户通过邀请码注册时未提供 password 字段，THE Invite_Registration_API SHALL 返回 400 错误并提示"参数校验失败"
3. WHEN 用户通过邀请码注册时未提供 phone 字段，THE Invite_Registration_API SHALL 返回 400 错误并提示"参数校验失败"
4. WHEN 用户通过邀请码注册时未提供短信验证码 code 字段，THE Invite_Registration_API SHALL 返回 400 错误并提示"参数校验失败"
5. THE Invite_Registration_API SHALL 使用与普通注册相同的 email、password、phone 校验规则（emailSchema、passwordSchema、phoneSchema）

### 需求 2：邀请码注册时验证手机号

**用户故事：** 作为平台管理员，我希望邀请码注册时验证手机号的真实性，以防止虚假注册。

#### 验收标准

1. WHEN 用户提供的短信验证码与手机号不匹配，THE Invite_Registration_API SHALL 返回 400 错误并提示"验证码错误或已过期"
2. WHEN 用户提供的邮箱已被其他账户注册，THE Invite_Registration_API SHALL 返回 409 错误并提示"该邮箱已被注册"
3. WHEN 用户提供的手机号已被其他账户绑定，THE Invite_Registration_API SHALL 返回 409 错误并提示"该手机号已被其他账户绑定"

### 需求 3：邀请码注册自动授予 DCR 权限

**用户故事：** 作为通过邀请码注册的用户，我希望注册成功后自动获得 DCR 区域访问权限，无需再单独申请。

#### 验收标准

1. WHEN 邀请码验证通过且身份信息校验成功，THE Invite_Registration_API SHALL 创建用户时将 `dcrAccess` 设置为 `true`
2. WHEN 邀请码注册成功，THE Invite_Registration_API SHALL 创建用户时将 `isAnonymous` 设置为 `false`
3. WHEN 邀请码注册成功，THE Invite_Registration_API SHALL 将用户的 email、passwordHash（bcrypt 加密后）和 phone 存储到 User 记录中

### 需求 4：密码安全存储

**用户故事：** 作为平台管理员，我希望邀请码注册的用户密码以安全方式存储，以保护用户账户安全。

#### 验收标准

1. THE Invite_Registration_API SHALL 使用 bcrypt 算法对用户密码进行哈希处理后再存储
2. THE Invite_Registration_API SHALL 在数据库中仅存储密码哈希值，不存储明文密码

### 需求 5：邀请码有效性验证保持不变

**用户故事：** 作为平台管理员，我希望邀请码的有效性验证逻辑保持不变，以确保邀请码机制的安全性。

#### 验收标准

1. WHEN 邀请码不存在，THE Invite_Registration_API SHALL 返回 400 错误并提示"邀请码无效"
2. WHEN 邀请码已被使用，THE Invite_Registration_API SHALL 返回 400 错误并提示"邀请码已被使用"
3. WHEN 邀请码已被撤销，THE Invite_Registration_API SHALL 返回 400 错误并提示"邀请码已被撤销"
4. WHEN 邀请码已过期，THE Invite_Registration_API SHALL 返回 400 错误并提示"邀请码已过期"

### 需求 6：事务一致性

**用户故事：** 作为平台管理员，我希望邀请码注册的所有数据库操作在同一事务中完成，以确保数据一致性。

#### 验收标准

1. THE Invite_Registration_API SHALL 在同一数据库事务中完成用户创建、邀请码状态更新和会话创建
2. IF 事务中任一操作失败，THEN THE Invite_Registration_API SHALL 回滚所有操作并返回 500 错误
