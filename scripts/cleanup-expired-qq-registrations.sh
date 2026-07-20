#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-forum-dcr2026-postgres-1}"

docker exec "$CONTAINER_NAME" psql -U postgres -d student_community -v ON_ERROR_STOP=1 \
  -c 'DELETE FROM "PendingQQRegistration" WHERE "consumedAt" IS NULL AND "expiresAt" < CURRENT_TIMESTAMP;' \
  >/dev/null
