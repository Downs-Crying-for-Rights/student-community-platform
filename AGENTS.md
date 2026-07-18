# AGENTS.md

## Tooling and verification

- Use Node.js 22 and npm. `package-lock.json`, Docker, and CI are npm-based; do not update the coexisting `pnpm-lock.yaml` unless deliberately migrating package managers.
- Install with `npm install` locally or `npm ci` in a clean/CI environment. `postinstall` runs `prisma generate`.
- Run focused tests with `npm test -- path/to/file.test.ts`; run one case with `npx vitest run path/to/file.test.ts -t "test name"`. Vitest uses Node, global APIs, `@` -> `src`, and `src/test/vitest.setup.ts`, which mocks deferred telemetry persistence.
- Validate with `npm run lint`, `npx tsc --noEmit`, then relevant tests. `npm run build` is not a typecheck because `next.config.ts` has `typescript.ignoreBuildErrors: true`; CI currently runs only `npm ci` and `npm run build`.
- The full local stack is `docker compose up -d --build`; inspect it with `docker compose ps` and `docker compose logs web --since 5m`. PostgreSQL 16 and Redis 7 are required outside Compose.
- For real HTTP verification, follow `.claude/skills/verify/SKILL.md`: use `http://127.0.0.1:3000`, delete `verify-*` records and temporary auth files afterward, and do not stop containers that were already running.

## Database and deployment

- Prisma schema, migrations, and seed live under `prisma/`. For normal schema changes, create and commit a migration with `npm run db:migrate`; use `npm run db:push` only when explicitly appropriate.
- The production Docker entrypoint currently runs `prisma db push --accept-data-loss` before `server.js`, despite the migration-based development workflow. Treat container startup as potentially schema-mutating.
- `npm run build` copies root `VERSION` to `public/VERSION`. A push to `main` deploys production and a separate workflow may commit an automatic patch bump to `VERSION`.
- Production `.env` stays on the server and is not uploaded by CI. Deployment verifies HTTPS OSS endpoints, retains three releases, and rolls back after a failed HTTPS health check.

## Runtime boundaries

- This is one Next.js App Router application. Pages and Route Handlers are both under `src/app`; server-side domain and infrastructure logic belongs in `src/lib` rather than being duplicated in routes or components.
- The root layout forces dynamic rendering and no fetch cache. Middleware also marks member responses private/no-store; do not introduce cross-user or cross-deployment RSC caching assumptions.
- `MemberShell` is mounted globally, but member navigation is selected by the path allowlist in `src/components/layout/MemberShell.tsx`, not route-group layouts. Update that allowlist when adding a member-facing root.
- Edge middleware cannot use Prisma. It gates pages from JWT claims only; profile/onboarding changes must refresh the JWT via `session.update()`.
- Middleware is not an API authorization boundary. Protect Route Handlers with `withAuth`/`withOptionalAuth` from `src/lib/rbac.ts`, then apply ABAC/trust or DCR admission checks where required. Use `isAdminRole`; `SUPER_ADMIN` must inherit admin behavior, while `DCR_HELPER` is a separate branch at trusted-user level.

## DCR invariants

- DCR is a workflow, not a forum board. Admission requires phone, DCR quiz, a linked `Case`, review, and pledge/access state. `AccessApplication.status`, `User.dcrAccess`, and `User.dcrPledgeSigned` are distinct; quiz completion alone never grants access.
- `/dcr` switches admission/workspace mode from the database-backed `/api/dcr/progress` DTO. Do not infer effective access solely from the session JWT or application approval.
- Case creation stores raw form data, structured extraction, timeline, and any access application in a serializable transaction. Approved cases can become tasks through `/api/dcr/tasks/from-case`; do not create a second review flow.
- Reuse `src/lib/dcr-admission-policy.ts`, `task-state-machine.ts`, `mutual-aid-cycle.ts`, extraction/review helpers, and `sensitive-engine.ts`; do not restate those rules inside handlers.

## Data and side effects

- Messaging is intentionally split: `Notification`, `DMThread`/`DMMessage`, `ChatRoom`/`ChatMessage`, `HelpChat`/`HelpChatMessage`, and `Message` serve different domains. Confirm semantics before reusing or merging tables. Updates are HTTP polling, not Redis pub/sub or WebSockets.
- OSS objects remain private. Client-facing media should use signed `/api/media` proxy URLs, not public bucket URLs.
- Sensitive-content/PII scanning in `src/lib/sensitive-engine.ts` is shared by posts, chat, evidence, and other user content; preserve it when adding write paths.
- Server telemetry and audit/notification writes are explicit side effects, not a general event bus. `src/instrumentation.ts` records unhandled server errors through telemetry; tests mock only deferred telemetry writes by default.
- Psychology confide/match creation endpoints intentionally return 503 while the data models remain; do not infer availability from Prisma models alone.
