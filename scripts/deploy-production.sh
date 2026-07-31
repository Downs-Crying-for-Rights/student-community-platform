#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/forum-dcr2026}"
RELEASE_SHA="${RELEASE_SHA:?RELEASE_SHA is required}"
RELEASE_DIR="$APP_DIR/releases/$RELEASE_SHA"
SHARED_DIR="$APP_DIR/shared"
CURRENT_LINK="$APP_DIR/current"
PROJECT_NAME="forum-dcr2026"
DEPLOY_OVERRIDE="$RELEASE_DIR/docker-compose.production.yml"
BOT_DIR="${BOT_DIR:-/opt/forum-dcr2026-bot}"
HEALTH_URL="https://forum.dcr2026.com/"
DEPLOYMENT_URL="https://forum.dcr2026.com/DEPLOYMENT"
PREVIOUS_RELEASE=""

if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK")"
fi

mkdir -p "$SHARED_DIR"
install -d -m 755 "$SHARED_DIR/logs"
touch "$SHARED_DIR/logs/deployment.log" "$SHARED_DIR/logs/services.log" \
  "$SHARED_DIR/logs/nginx-access.log" "$SHARED_DIR/logs/nginx-error.log"
chmod 644 "$SHARED_DIR/logs"/*.log
exec > >(tee -a "$SHARED_DIR/logs/deployment.log") 2>&1

if [[ ! -f "$SHARED_DIR/.env" ]]; then
  if [[ -f "$APP_DIR/.env" ]]; then
    cp "$APP_DIR/.env" "$SHARED_DIR/.env"
    chmod 600 "$SHARED_DIR/.env"
  else
    echo "Production environment file is missing: $SHARED_DIR/.env" >&2
    exit 1
  fi
fi

if [[ -n "${AI_ENV_PATH:-}" ]]; then
  if [[ ! -f "$AI_ENV_PATH" ]]; then
    echo "AI runtime configuration is missing: $AI_ENV_PATH" >&2
    exit 1
  fi
  while IFS='=' read -r key value; do
    case "$key" in
      DEEPSEEK_ENABLED|DEEPSEEK_API_KEY|DEEPSEEK_BASE_URL|DEEPSEEK_DEFAULT_MODEL|DEEPSEEK_COMPLEX_MODEL)
        sed -i "/^${key}=/d" "$SHARED_DIR/.env"
        printf '%s=%s\n' "$key" "$value" >> "$SHARED_DIR/.env"
        ;;
      "") ;;
      *)
        echo "Unexpected AI runtime configuration key: $key" >&2
        exit 1
        ;;
    esac
  done < "$AI_ENV_PATH"
  chmod 600 "$SHARED_DIR/.env"
  rm -f -- "$AI_ENV_PATH"
fi

if ! grep -q '^SYSTEM_SECRET_ENCRYPTION_KEY=' "$SHARED_DIR/.env"; then
  printf 'SYSTEM_SECRET_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> "$SHARED_DIR/.env"
fi
if ! grep -q '^IDENTITY_VERIFICATION_ENCRYPTION_KEY=' "$SHARED_DIR/.env"; then
  printf 'IDENTITY_VERIFICATION_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> "$SHARED_DIR/.env"
fi
if ! grep -q '^IDENTITY_VERIFICATION_HMAC_KEY=' "$SHARED_DIR/.env"; then
  printf 'IDENTITY_VERIFICATION_HMAC_KEY=%s\n' "$(openssl rand -hex 32)" >> "$SHARED_DIR/.env"
fi
if ! grep -q '^IDENTITY_VERIFICATION_KEY_VERSION=' "$SHARED_DIR/.env"; then
  printf 'IDENTITY_VERIFICATION_KEY_VERSION=1\n' >> "$SHARED_DIR/.env"
fi

cp "$SHARED_DIR/.env" "$RELEASE_DIR/.env"
chmod 600 "$RELEASE_DIR/.env"

cd "$RELEASE_DIR"
printf '%s\n' "$RELEASE_SHA" > public/DEPLOYMENT
docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" config --quiet

# Apply reviewed forward-only migrations as an explicit deployment phase.
# The application container itself never mutates the database on restart.
APP_RELEASE="$RELEASE_SHA" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" build web
APP_RELEASE="$RELEASE_SHA" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" up -d postgres
postgres_ready=false
for attempt in {1..30}; do
  if docker compose -p "$PROJECT_NAME" exec -T postgres pg_isready -U postgres -d student_community >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  echo "PostgreSQL readiness attempt $attempt/30 failed; retrying in 2 seconds"
  sleep 2
done
if [[ "$postgres_ready" != true ]]; then
  echo "PostgreSQL did not become ready; migrations were not attempted" >&2
  docker compose -p "$PROJECT_NAME" logs --tail=100 postgres >&2 || true
  exit 1
fi

# Older production releases used `prisma db push`, so the live schema can be
# current while `_prisma_migrations` has no applied records. Production is
# known to be on c077db0, whose migration history ended at this directory.
# Baseline only that history, then let later migrations perform their data
# backfills before adding required columns and constraints.
LEGACY_BASELINE_LAST_MIGRATION="20260720223000_add_account_deletion_and_invite_dcr_contribution"
migration_table_present="$(docker compose -p "$PROJECT_NAME" exec -T postgres \
  psql -U postgres -d student_community -tAc \
  "SELECT CASE WHEN to_regclass('public._prisma_migrations') IS NULL THEN 'false' ELSE 'true' END" \
  | tr -d '[:space:]')"
applied_migration_count=0
if [[ "$migration_table_present" == "true" ]]; then
  applied_migration_count="$(docker compose -p "$PROJECT_NAME" exec -T postgres \
    psql -U postgres -d student_community -tAc \
    'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL' \
    | tr -d '[:space:]')"
fi
application_table_count="$(docker compose -p "$PROJECT_NAME" exec -T postgres \
  psql -U postgres -d student_community -tAc \
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'" \
  | tr -d '[:space:]')"

if [[ "$applied_migration_count" == "0" && "$application_table_count" != "0" ]]; then
  echo "Legacy db-push database detected; baselining through $LEGACY_BASELINE_LAST_MIGRATION"
  APP_RELEASE="$RELEASE_SHA" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" run --rm --no-deps web \
    sh -ec "
      baseline_found=false
      for migration_dir in ./prisma/migrations/*; do
        [ -d \"\$migration_dir\" ] || continue
        migration_name=\"\$(basename \"\$migration_dir\")\"
        node /prisma-cli/node_modules/prisma/build/index.js migrate resolve \
          --applied \"\$migration_name\" \
          --schema=./prisma/schema.prisma
        if [ \"\$migration_name\" = \"$LEGACY_BASELINE_LAST_MIGRATION\" ]; then
          baseline_found=true
          break
        fi
      done
      [ \"\$baseline_found\" = true ] || {
        echo \"Legacy baseline migration is missing: $LEGACY_BASELINE_LAST_MIGRATION\" >&2
        exit 1
      }
    "
fi

APP_RELEASE="$RELEASE_SHA" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" run --rm --no-deps web \
  node /prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma
APP_RELEASE="$RELEASE_SHA" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" up -d --no-build --remove-orphans

if ! docker compose -p "$PROJECT_NAME" exec -T web sh -ec '
  test -n "$OSS_REGION"
  test -n "$OSS_BUCKET"
  test -n "$OSS_ACCESS_KEY_ID"
  test -n "$OSS_ACCESS_KEY_SECRET"
  test -n "$OSS_ENDPOINT"
  test -n "$OSS_CDN_DOMAIN"
  case "$OSS_ENDPOINT" in https://*) ;; *) exit 1 ;; esac
  case "$OSS_CDN_DOMAIN" in https://*) ;; *) exit 1 ;; esac
  if [ "$DEEPSEEK_ENABLED" = "true" ]; then
    test -n "$DEEPSEEK_API_KEY"
    test "$DEEPSEEK_BASE_URL" = "https://api.deepseek.com"
    test "$DEEPSEEK_DEFAULT_MODEL" = "deepseek-v4-flash"
    test "$DEEPSEEK_COMPLEX_MODEL" = "deepseek-v4-flash"
  fi
  case "$QQ_OFFICIAL_BOT_ENABLED" in
    true|1)
      test "$NEXTAUTH_URL" = "https://forum.dcr2026.com" || test "$NEXTAUTH_URL" = "https://forum.dcr2026.com/"
      case "$QQ_OFFICIAL_BOT_APP_ID" in *[!0-9]*|"") exit 1 ;; esac
      test "${#QQ_OFFICIAL_BOT_APP_ID}" -ge 5
      test "${#QQ_OFFICIAL_BOT_APP_ID}" -le 20
      test "${#QQ_OFFICIAL_BOT_CLIENT_SECRET}" -ge 8
      ;;
    false|0|"") ;;
    *) exit 1 ;;
  esac
'; then
  echo "Post-start configuration validation failed" >&2
  docker compose -p "$PROJECT_NAME" logs --tail=100 web >&2 || true
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    echo "Rolling back to $PREVIOUS_RELEASE" >&2
    cd "$PREVIOUS_RELEASE"
    APP_RELEASE="$(basename "$PREVIOUS_RELEASE")" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" up -d --build --remove-orphans
  fi
  exit 1
fi

healthy=false
for attempt in {1..24}; do
  deployment_id="$(curl --fail --silent --show-error --max-time 10 \
    --resolve forum.dcr2026.com:443:127.0.0.1 \
    "$DEPLOYMENT_URL" 2>/dev/null || true)"
  if [[ "$deployment_id" == "$RELEASE_SHA" ]] && \
    curl --fail --silent --show-error --max-time 10 \
      --resolve forum.dcr2026.com:443:127.0.0.1 \
      "$HEALTH_URL" >/dev/null; then
    healthy=true
    break
  fi
  echo "Health check attempt $attempt/24 failed (deployment=$deployment_id); retrying in 5 seconds"
  sleep 5
done

if [[ "$healthy" != true ]]; then
  echo "Deployment health check failed" >&2
  docker compose -p "$PROJECT_NAME" logs --tail=100 web >&2 || true

  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    echo "Rolling back to $PREVIOUS_RELEASE" >&2
    cd "$PREVIOUS_RELEASE"
    APP_RELEASE="$(basename "$PREVIOUS_RELEASE")" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" up -d --build --remove-orphans
  fi
  exit 1
fi

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.new"
mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"

if [[ -f "$BOT_DIR/docker-compose.yml" ]]; then
  if ! (cd "$BOT_DIR" && docker compose up -d --build --no-deps worker); then
    echo "QQ bot Worker deployment failed" >&2
    if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
      ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK.new"
      mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"
      rollback_failed=false
      (cd "$PREVIOUS_RELEASE" && APP_RELEASE="$(basename "$PREVIOUS_RELEASE")" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" up -d --build --remove-orphans) || rollback_failed=true
      (cd "$BOT_DIR" && docker compose up -d --build --no-deps worker) || rollback_failed=true
      if [[ "$rollback_failed" == true ]]; then echo "QQ bot rollback failed" >&2; fi
    fi
    exit 1
  fi
  worker_live=false
  for _ in {1..12}; do
    if docker exec forum-dcr2026-qq-worker wget -q -O /dev/null http://127.0.0.1:8081/livez; then
      worker_live=true
      break
    fi
    sleep 2
  done
  if [[ "$worker_live" != true ]]; then
    echo "QQ bot Worker liveness check failed" >&2
    docker logs --tail=100 forum-dcr2026-qq-worker >&2 || true
    if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
      ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK.new"
      mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"
      rollback_failed=false
      (cd "$PREVIOUS_RELEASE" && APP_RELEASE="$(basename "$PREVIOUS_RELEASE")" docker compose -f docker-compose.yml -f "$DEPLOY_OVERRIDE" -p "$PROJECT_NAME" up -d --build --remove-orphans) || rollback_failed=true
      (cd "$BOT_DIR" && docker compose up -d --build --no-deps worker) || rollback_failed=true
      if [[ "$rollback_failed" == true ]]; then echo "QQ bot rollback failed" >&2; fi
    fi
    exit 1
  fi
fi

chmod +x "$CURRENT_LINK/scripts/collect-production-logs.sh"
chmod +x "$CURRENT_LINK/scripts/cleanup-expired-qq-registrations.sh"
chmod +x "$CURRENT_LINK/scripts/cleanup-expired-identity-evidence.sh"
cat > /etc/systemd/system/forum-dcr2026-log-collector.service <<EOF
[Unit]
Description=Forum DCR2026 production log collector
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
Environment=APP_DIR=$APP_DIR
ExecStart=$CURRENT_LINK/scripts/collect-production-logs.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/forum-dcr2026-qq-registration-cleanup.service <<EOF
[Unit]
Description=Remove expired QQ registration credentials
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$CURRENT_LINK/scripts/cleanup-expired-qq-registrations.sh
EOF

cat > /etc/systemd/system/forum-dcr2026-qq-registration-cleanup.timer <<EOF
[Unit]
Description=Run QQ registration credential cleanup every 15 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/forum-dcr2026-identity-evidence-cleanup.service <<EOF
[Unit]
Description=Remove expired identity verification evidence
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$CURRENT_LINK/scripts/cleanup-expired-identity-evidence.sh
EOF

cat > /etc/systemd/system/forum-dcr2026-identity-evidence-cleanup.timer <<EOF
[Unit]
Description=Run identity verification evidence cleanup daily

[Timer]
OnBootSec=10min
OnUnitActiveSec=1d
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/logrotate.d/forum-dcr2026-console <<EOF
$SHARED_DIR/logs/*.log {
  daily
  size 20M
  rotate 7
  compress
  missingok
  notifempty
  copytruncate
}
EOF

systemctl daemon-reload
systemctl enable --now forum-dcr2026-log-collector.service
systemctl restart forum-dcr2026-log-collector.service
systemctl enable --now forum-dcr2026-qq-registration-cleanup.timer
systemctl enable --now forum-dcr2026-identity-evidence-cleanup.timer

find "$APP_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | awk 'NR > 3 { sub(/^[^ ]+ /, ""); print }' \
  | xargs -r rm -rf --

rm -rf -- "/tmp/forum-dcr2026-$RELEASE_SHA" "/tmp/forum-dcr2026-$RELEASE_SHA.tar.gz"
echo "Deployment $RELEASE_SHA is healthy at $HEALTH_URL"
