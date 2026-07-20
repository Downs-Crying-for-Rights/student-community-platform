#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/forum-dcr2026}"
LOG_DIR="$APP_DIR/shared/logs"
PROJECT_NAME="forum-dcr2026"
NGINX_ACCESS="/www/wwwlogs/forum.dcr2026.com.log"
NGINX_ERROR="/www/wwwlogs/forum.dcr2026.com.error.log"

install -d -m 755 "$LOG_DIR"
touch "$LOG_DIR/services.log" "$LOG_DIR/nginx-access.log" "$LOG_DIR/nginx-error.log"
chmod 644 "$LOG_DIR"/*.log

children=()
cleanup() {
  if ((${#children[@]})); then
    kill "${children[@]}" 2>/dev/null || true
    wait "${children[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$APP_DIR/current"
docker compose -p "$PROJECT_NAME" logs --no-color --timestamps --follow --tail=300 web postgres redis \
  >>"$LOG_DIR/services.log" 2>&1 &
children+=("$!")

if docker inspect forum-dcr2026-qq-worker >/dev/null 2>&1; then
  docker logs --timestamps --follow --tail=300 forum-dcr2026-qq-worker \
    >>"$LOG_DIR/services.log" 2>&1 &
  children+=("$!")
fi

tail_source() {
  local source="$1"
  local destination="$2"
  while [[ ! -f "$source" ]]; do
    printf '%s waiting for %s\n' "$(date --iso-8601=seconds)" "$source" >>"$destination"
    sleep 30
  done
  exec tail -n 300 -F "$source" >>"$destination" 2>&1
}

tail_source "$NGINX_ACCESS" "$LOG_DIR/nginx-access.log" &
children+=("$!")
tail_source "$NGINX_ERROR" "$LOG_DIR/nginx-error.log" &
children+=("$!")

wait -n "${children[@]}"
