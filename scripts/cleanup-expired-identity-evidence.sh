#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER_NAME="${WEB_CONTAINER_NAME:-forum-dcr2026-web-1}"

docker exec "$CONTAINER_NAME" sh -ec '
  test -n "$INTERNAL_API_TOKEN"
  wget -q -O /dev/null \
    --header="Authorization: Bearer $INTERNAL_API_TOKEN" \
    --post-data="" \
    http://127.0.0.1:3000/v1/internal/identity-verification/cleanup
'
