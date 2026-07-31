# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 开发环境与命令

- 使用 **Node.js 22**，以对齐 Docker 与 GitHub Actions（README 声明的最低版本是 Node.js 20）。
- 默认包管理器是 **npm**。虽然仓库也有 `pnpm-lock.yaml`，但 Docker、CI 和 README 均使用 `package-lock.json` 与 npm；不要无意间切换包管理器。
- 本地服务依赖 PostgreSQL 16+ 与 Redis 7+；推荐使用 Docker Compose。

```bash
# 安装依赖（CI/干净环境用 npm ci）
npm install

# 开发、构建、生产启动
npm run dev
npm run build
npm run start

# 静态检查与类型检查（项目没有 typecheck npm script）
npm run lint
npx tsc --noEmit

# 全部测试
npm test

# 单个测试文件
npm test -- src/lib/__tests__/example.test.ts

# 单个测试用例
npx vitest run src/lib/__tests__/example.test.ts -t "test name"

# 数据库
npm run db:migrate
npm run db:push
npm run db:seed
npm run db:studio

# 完整本地栈
docker compose up -d --build
docker compose ps
docker compose logs web --since 5m
```

Vitest 使用 Node 环境、全局测试 API 和 `@` → `src` 别名；`src/test/vitest.setup.ts` 默认 mock telemetry 的异步持久化。测试分布在 `src/**/__tests__` 与 `prisma/__tests__`，部分规则使用 `fast-check` 做 property-based testing。

Prisma 使用 PostgreSQL，schema 与迁移位于 `prisma/`。日常 schema 变更应生成并提交 migration，优先使用 `npm run db:migrate`；注意当前 Docker 入口会在启动前执行 `prisma db push --accept-data-loss`，与 README 的 migration 流程不同。

需要端到端运行验证时，遵循 `.claude/skills/verify/SKILL.md`：使用 Docker Compose 和真实 HTTP 请求，清理所建验证数据，不要停止用户原本运行的容器。

## 技术栈与运行模型

这是 Next.js 15 App Router + React 19 + TypeScript strict 项目，使用 NextAuth v4、Prisma/PostgreSQL、Redis、Tailwind/Radix UI、Vitest。根布局强制动态渲染并禁用 fetch 缓存；成员页中间件也设置 private/no-store，因此不要假设页面或 RSC 数据可跨会话、跨部署缓存。

`next.config.ts` 当前设置 `typescript.ignoreBuildErrors: true`，所以 `npm run build` 成功不代表类型检查通过；需要单独运行 `npx tsc --noEmit`。

## 高层架构

### 路由与页面外壳

- 页面和 API 均位于 `src/app`；Route Handlers 构成主要服务端接口层。
- 根布局始终挂载 `MemberShell`。成员导航是否显示不是由 route-group/layout 层级决定，而由 `src/components/layout/MemberShell.tsx` 中的路径白名单决定。新增成员页面时同步检查该白名单。
- `/messages` 是通知、私信和群聊的聚合入口；`/chat` 仅重定向到其 chat tab。
- `/dcr` 不是普通落地页，而是由 `/api/dcr/progress` 返回的统一 DTO 在“准入流程”和“工作台”之间切换。

### 认证与授权

- `src/lib/auth.ts` 使用 JWT session；支持邮件链接、邮箱密码、手机验证码和运行时注入的 QQ OAuth provider。
- Edge middleware 不能使用 Prisma，因此只根据 JWT 做页面级登录、昵称和 onboarding/quiz 前置检查。
- API 权限边界位于 `src/lib/rbac.ts` 的 `withAuth` / `withOptionalAuth`，负责 session、最低角色、request id 和 telemetry；不要只依赖 middleware 保护 API。
- 权限是三层组合：RBAC 角色、`src/lib/abac.ts`/trust level 的账号属性，以及 `src/lib/dcr-admission-policy.ts` 的 DCR 专项准入规则。

### DCR 核心业务流

DCR 是独立工作流子系统，不是论坛板块的别名：

1. 准入依次要求手机、DCR quiz、委托 `Case`、管理员审核与守则签署。
2. 创建 `Case` 时会在 serializable transaction 中保存原始表单、结构化抽取、timeline，并在需要时创建 `AccessApplication`。
3. application 状态、`User.dcrAccess` 和 `User.dcrPledgeSigned` 是分离状态；quiz 通过只设置资格，不直接开放 DCR。
4. 审核通过的 Case 可经 `/api/dcr/tasks/from-case` 直接复用为 `MutualAidTask`，避免重复审核。
5. 任务使用 `src/lib/task-state-machine.ts` 的独立状态机；协作数据进一步拆为 help claim/session、专用 chat 和 evidence room。
6. `src/lib/mutual-aid-cycle.ts` 另行实现双人/三人互助闭环、匹配、link 状态与整体 cycle 状态。

修改 DCR 时优先复用 `src/lib` 中的 admission policy、field extractor、review rules、task state machine 与 mutual-aid cycle 引擎，避免在 route handler 或组件中复制规则。

### 数据模型与消息边界

`prisma/schema.prisma` 同时包含以下业务域：

- 用户身份、能力 flag、信誉和违规状态；
- 公开社区（Board/Post/Comment/Report 等）；
- DCR 准入、Case、任务、证据与互助闭环；
- 心理区（模型仍保留，但当前 confide/match 创建入口返回 503）；
- 治理审计、遥测、知识内容和题库。

消息不是单一通用表：`Notification`、`DMThread/DMMessage`、`ChatRoom/ChatMessage`、`HelpChat/HelpChatMessage` 分别服务不同场景，另有 `Message` 供 Case/心理会话使用。不要在没有确认业务语义时跨表复用或合并消息逻辑。当前消息更新主要通过普通 GET/POST 拉取，Redis 不是 WebSocket/pub-sub 总线。

### 基础设施与副作用

- `src/lib/redis.ts` 主要用于缓存、限流、验证码和登录防护。
- `src/lib/sensitive-engine.ts` 是跨帖子、DCR chat、证据和群聊复用的敏感词/PII 检测层。
- `src/lib/oss.ts` 通过 S3 SDK 接入阿里云 OSS；对象保持私有，客户端使用签名的 `/api/media` 代理 URL，而不是公开 bucket URL。
- 通知与审计当前是显式数据库写入；关键状态与 audit 可在同一事务内，邮件/通知等通常在事务后 best-effort 执行，并不存在统一异步事件总线。
- `instrumentation.ts` 会包装 `console.*` 并批量写入 `SystemLog`；调整服务端日志时考虑该持久化副作用。

## 部署相关约束

- 推送到 `main` 会触发生产部署，并可能由 workflow 自动提交 `VERSION` 的 patch bump。
- `npm run build` 会把根目录 `VERSION` 复制到 `public/VERSION`。
- 当前 CI 的部署 gate 只执行 `npm ci` 和 `npm run build`，不会替代本地的 lint、typecheck 或测试。
- 生产 `.env` 常驻服务器，不由 GitHub workflow 上传；部署脚本还会验证 OSS HTTPS 配置并在健康检查失败时回滚。
