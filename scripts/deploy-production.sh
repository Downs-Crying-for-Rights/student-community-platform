#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/forum-dcr2026}"
RELEASE_SHA="${RELEASE_SHA:?RELEASE_SHA is required}"
RELEASE_DIR="$APP_DIR/releases/$RELEASE_SHA"
SHARED_DIR="$APP_DIR/shared"
CURRENT_LINK="$APP_DIR/current"
PROJECT_NAME="forum-dcr2026"
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

cp "$SHARED_DIR/.env" "$RELEASE_DIR/.env"
chmod 600 "$RELEASE_DIR/.env"

cd "$RELEASE_DIR"
printf '%s\n' "$RELEASE_SHA" > public/DEPLOYMENT
docker compose -p "$PROJECT_NAME" config --quiet
APP_RELEASE="$RELEASE_SHA" docker compose -p "$PROJECT_NAME" up -d --build --remove-orphans

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
    APP_RELEASE="$(basename "$PREVIOUS_RELEASE")" docker compose -p "$PROJECT_NAME" up -d --build --remove-orphans
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
    APP_RELEASE="$(basename "$PREVIOUS_RELEASE")" docker compose -p "$PROJECT_NAME" up -d --build --remove-orphans
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
      (cd "$PREVIOUS_RELEASE" && APP_RELEASE="$(basename "$PREVIOUS_RELEASE")" docker compose -p "$PROJECT_NAME" up -d --build --remove-orphans) || rollback_failed=true
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
      (cd "$PREVIOUS_RELEASE" && APP_RELEASE="$(basename "$PREVIOUS_RELEASE")" docker compose -p "$PROJECT_NAME" up -d --build --remove-orphans) || rollback_failed=true
      (cd "$BOT_DIR" && docker compose up -d --build --no-deps worker) || rollback_failed=true
      if [[ "$rollback_failed" == true ]]; then echo "QQ bot rollback failed" >&2; fi
    fi
    exit 1
  fi
fi

chmod +x "$CURRENT_LINK/scripts/collect-production-logs.sh"
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

find "$APP_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | awk 'NR > 3 { sub(/^[^ ]+ /, ""); print }' \
  | xargs -r rm -rf --

rm -rf -- "/tmp/forum-dcr2026-$RELEASE_SHA" "/tmp/forum-dcr2026-$RELEASE_SHA.tar.gz"
echo "Deployment $RELEASE_SHA is healthy at $HEALTH_URL"
