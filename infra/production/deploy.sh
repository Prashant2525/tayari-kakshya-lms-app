#!/usr/bin/env bash
# Deploys the checked-out commit to this server (Phase 18). Run as root (or a docker-group user) from anywhere:
#   infra/production/deploy.sh            build + back up + migrate + start, tagged with the git commit
#   infra/production/deploy.sh --no-build start the current TK_RELEASE again (e.g. after editing settings)
# Steps: build images → back up the database (if it exists) → `prisma migrate deploy` → start / replace the API,
# worker, website and proxy → wait until the API is ready. Images keep their tag, so rollback.sh can return to any
# earlier release. Guide: docs/ENVIRONMENT_AND_PRODUCTION_DEPLOYMENT_GUIDE.md §8–§9.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
envfile="$here/.env"
[ -f "$envfile" ] || { echo "Missing $envfile (copy compose.env.example and fill it in)" >&2; exit 1; }

build=true
[ "${1:-}" = "--no-build" ] && build=false

if $build; then
  release="$(git -C "$root" rev-parse --short=12 HEAD)"
  if [ -n "$(git -C "$root" status --porcelain --untracked-files=no)" ]; then
    echo "The working tree has uncommitted changes; deploy a commit." >&2
    exit 1
  fi
else
  release="$(grep -E '^TK_RELEASE=' "$envfile" | cut -d= -f2-)"
  [ -n "$release" ] || { echo "TK_RELEASE is empty in $envfile" >&2; exit 1; }
fi
export TK_RELEASE="$release"
compose() { docker compose -f "$here/docker-compose.prod.yml" --env-file "$envfile" "$@"; }

echo "==> Release $release"
if $build; then
  # The four images share one heavy build stage. Build it once first (the migrate image is that stage), so the others
  # come from the cache instead of four builds running at the same time (too much memory on a small server).
  compose --profile tools build --pull migrate
  compose build api web proxy
fi

echo "==> Database and Redis"
compose up -d --wait postgres redis

if compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select 1 from _prisma_migrations limit 1"' >/dev/null 2>&1; then
  echo "==> Backup before migrating"
  "$here/backup.sh" pre-deploy
fi

echo "==> Migrations"
compose --profile tools run --rm migrate

echo "==> API, worker, website, proxy"
compose up -d --wait --remove-orphans api worker web proxy

# Remember the release (rollback.sh lists these) and make --no-build / rollback reuse it.
if grep -qE '^TK_RELEASE=' "$envfile"; then
  sed -i "s/^TK_RELEASE=.*/TK_RELEASE=$release/" "$envfile"
else
  echo "TK_RELEASE=$release" >>"$envfile"
fi
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $release" >>"$here/releases.log"

api_domain="$(grep -E '^API_DOMAIN=' "$envfile" | cut -d= -f2-)"
# A local rehearsal (*.localhost) uses Caddy's own certificate authority, which curl does not know.
insecure=()
case "$api_domain" in *.localhost) insecure=(-k) ;; esac
echo "==> Waiting for https://$api_domain/api/v1/health/ready"
for _ in $(seq 1 30); do
  if curl -fsS "${insecure[@]}" "https://$api_domain/api/v1/health/ready" >/dev/null 2>&1; then
    echo "==> Release $release is live. Run the smoke tests (guide §9)."
    exit 0
  fi
  sleep 5
done
echo "The API did not report ready within 150 s. Check: docker compose logs api proxy — or roll back." >&2
exit 1
