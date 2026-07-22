# Production migration recovery

Production deploys run `prisma migrate deploy` only after PostgreSQL reports ready. Application and rollback containers always run `node server.js`; container startup never runs `db push`, a backfill, or a migration.

## Migration history mismatch

Do not automatically mark migrations applied and do not use `prisma db push` to bypass a failure. The production database may contain schema changes that were previously applied outside Prisma migration history, and only an operator who has compared the live schema with the exact migration SQL can decide whether `migrate resolve` is valid.

1. Stop the deployment before starting the new web container.
2. Back up the production database.
3. From the release directory, start and wait for PostgreSQL, then inspect history:

   ```sh
   docker compose -p forum-dcr2026 up -d postgres
   docker compose -p forum-dcr2026 run --rm --no-deps web node /prisma-cli/node_modules/prisma/build/index.js migrate status --schema=./prisma/schema.prisma
   ```

4. Compare `_prisma_migrations`, the live PostgreSQL schema, and every reported migration SQL. Also verify any data backfill invariants separately.
5. If a migration is fully present in both schema and data, an operator may explicitly record that one reviewed migration with `prisma migrate resolve --applied <migration_name>`. If it is partially applied, write and review a forward repair migration instead.
6. Re-run `migrate status`, then run the normal deployment. Keep the backup until application verification is complete.

`migrate resolve` changes history only. It does not execute SQL or prove that a backfill completed.
