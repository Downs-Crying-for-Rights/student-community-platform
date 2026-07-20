# 学互会

面向学生群体的多层级社区系统，包含公开区（娱乐与技术科普）、半私密心理交流区（同伴倾听与情绪支持）、私密 DCR 区（权益信息互助与合规工单流转）。

## 技术栈

- **前端框架**: Next.js 15 (App Router) + TypeScript
- **UI 组件**: shadcn/ui + Tailwind CSS
- **数据库**: PostgreSQL + Prisma ORM
- **缓存/队列**: Redis (ioredis)
- **认证**: NextAuth.js（邮箱魔法链接）
- **部署**: Docker Compose

## 环境要求

- Node.js >= 20
- npm >= 10
- Docker & Docker Compose（可选，用于一键启动）
- PostgreSQL 16+（本地开发需要）
- Redis 7+（本地开发需要）

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone <repo-url>
cd student-community-platform

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写 NEXTAUTH_SECRET 和 SMTP 配置

# 3. 一键启动
docker compose up -d --build

# 4. 运行数据库迁移和种子数据
docker compose exec web npx prisma migrate deploy
docker compose exec web npx prisma db seed

# 访问 http://localhost:3000
```

### 方式二：本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，确保 DATABASE_URL 和 REDIS_URL 指向本地服务

# 3. 初始化数据库
npx prisma migrate dev

# 4. 加载种子数据
npx prisma db seed

# 5. 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```
# 通过邮箱提升为管理员
npx tsx scripts/promote-user.ts --email you@example.com --role ADMIN

# 通过手机号提升为管理员
npx tsx scripts/promote-user.ts --phone 13800138000 --role ADMIN

# 也可以设置其他角色: USER, TRUSTED_USER, DCR_HELPER, MODERATOR, ADMIN
npx tsx scripts/promote-user.ts --email someone@example.com --role MODERATOR

## 阿里云短信

本地默认使用 `SMS_TEST_MODE=true` 和固定验证码 `888888`。生产环境使用阿里云号码认证服务 `SendSmsVerifyCode`：

1. 在阿里云号码认证服务中开通短信认证服务。
2. 配置系统赠送签名及登录、换绑、重置密码等模板，模板参数包含 `${code}` 和 `${min}`。
3. 创建仅授予 `dypns:SendSmsVerifyCode` 权限的 RAM 用户，避免使用主账号 AccessKey。
4. 在生产 `.env` 中设置 `SMS_TEST_MODE=false`、阿里云标准凭据、签名和各业务模板 ID，完整变量见 `.env.example`。

应用直接发送 Redis 生成的 6 位验证码，验证码有效期 5 分钟。SDK 自动重试和服务端自动换签重试均已关闭，并通过 Redis 对同一手机号执行 60 秒发送频控；发送失败会清理验证码和频控键。

超级管理员可在“后台管理 → 系统维护”启用或关闭短信验证码。关闭后登录、绑定手机号和重置密码不会发送或校验短信；账号状态、密码格式和频率限制等其他校验仍然生效。此模式下仅知道手机号的人即可登录对应账号或重置其密码，属于高风险应急开关。所有新注册账号首次登录后必须补齐昵称、头像和 QQ 号，个人简介可选。

## 项目结构

```
src/
├── app/                # Next.js App Router 页面与 API 路由
│   ├── (public)/       # 公开页面
│   ├── (auth)/         # 认证页面
│   ├── (member)/       # 会员页面
│   ├── (psych)/        # 心理区页面
│   ├── (dcr)/          # DCR 区页面
│   ├── (admin)/        # 管理后台页面
│   └── api/            # API 路由
├── components/         # UI 组件
│   ├── ui/             # shadcn/ui 基础组件
│   ├── layout/         # 布局组件
│   ├── feed/           # Feed 相关组件
│   ├── post/           # 帖子相关组件
│   ├── comment/        # 评论相关组件
│   ├── dcr/            # DCR 相关组件
│   ├── psych/          # 心理区相关组件
│   ├── admin/          # 管理后台组件
│   └── shared/         # 共享组件
├── lib/                # 核心库（认证、数据库、Redis、权限等）
└── prisma/             # Prisma Schema 与迁移
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run lint` | 运行 ESLint 检查 |
| `npx prisma migrate dev` | 运行数据库迁移 |
| `npx prisma db seed` | 加载种子数据 |
| `npx prisma studio` | 打开 Prisma 数据库管理界面 |
| `docker compose up -d` | Docker 一键启动 |
| `docker compose down` | 停止所有 Docker 服务 |
