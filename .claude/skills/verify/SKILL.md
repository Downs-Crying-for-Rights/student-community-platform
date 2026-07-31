---
name: verify
summary: 通过 Docker Compose 启动并在真实 HTTP 接口验证产品改动
---

# 项目运行时验证

1. 用 `docker compose up -d --build` 构建并启动 PostgreSQL、Redis 和 Next.js。
2. 用 `docker compose ps` 与 `docker compose logs web --since 5m` 确认应用 Ready，容器启动时会执行 `prisma db push`。
3. API 验证使用 `http://127.0.0.1:3000`：
   - 注册：`POST /api/auth/register`
   - 获取 CSRF：`GET /api/auth/csrf`
   - 密码登录：`POST /api/auth/callback/credentials-password`，用 cookie jar 保存 JWT
   - 会话：`GET /api/auth/session`
4. 需要构造任务或群聊状态时，使用 `docker compose exec -T postgres psql -U postgres -d student_community` 写入专用 `verify-*` 数据。
5. 验证完成后删除本地 cookie/env 文件和专用验证数据；不要停止用户原本正在使用的容器。

注意：`nicknameSchema` 当前不接受包含中文数字的昵称（如“一期验证用户”），冷启动验证时使用纯英文昵称。
