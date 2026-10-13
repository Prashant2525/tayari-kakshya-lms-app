#!/usr/bin/env bash
# Returns the API, worker, website and proxy to an earlier release's images (guide §9).
#   infra/production/rollback.sh             list the releases deployed on this server
#   infra/production/rollback.sh <release>   start that release again
# Database migrations only move forward: rolling back past a release that changed the database is safe only when that
# migration kept the old release working (they are written to). Otherwise restore the pre-deploy backup (restore.sh).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
envfile="$here/.env"
release="${1:-}"
if [ -z "$release" ]; then
  echo "Deployed releases (newest last):"
  tail -n 20 "$here/releases.log" 2>/dev/null || echo "  none recorded"
  exit 0
fi
docker image inspect "tayari-kakshya/api:$release" >/dev/null 2>&1 || {
  echo "No images for release $release on this server (docker image ls tayari-kakshya/api)." >&2
  exit 1
}
export TK_RELEASE="$release"
docker compose -f "$here/docker-compose.prod.yml" --env-file "$envfile" up -d --wait --no-build api worker web proxy
sed -i "s/^TK_RELEASE=.*/TK_RELEASE=$release/" "$envfile"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $release (rollback)" >>"$here/releases.log"
echo "==> Running release $release. Run the smoke tests (guide §9)."
