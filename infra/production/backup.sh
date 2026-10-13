#!/usr/bin/env bash
# Encrypted PostgreSQL backups (guide §8 step 16). Run nightly from root's crontab, e.g.
#   15 2 * * * /opt/tayari-kakshya/infra/production/backup.sh nightly >>/var/log/tayari-kakshya-backup.log 2>&1
# and by deploy.sh before every migration (`pre-deploy`).
# Keeps 7 daily, 4 weekly (Sundays) and 6 monthly (1st of the month) dumps, plus the last 5 pre-deploy dumps; copies
# them off-site with rclone when BACKUP_RCLONE_REMOTE is set. Dumps are `pg_dump -Fc`, encrypted with AES-256
# (openssl, PBKDF2) using BACKUP_PASSPHRASE — keep that passphrase in your password manager.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
envfile="$here/.env"
kind="${1:-nightly}"
get() { grep -E "^$1=" "$envfile" | cut -d= -f2-; }

passphrase="$(get BACKUP_PASSPHRASE)"
dir="$(get BACKUP_DIR)"
remote="$(get BACKUP_RCLONE_REMOTE)"
[ -n "$passphrase" ] || { echo "BACKUP_PASSPHRASE is empty in $envfile" >&2; exit 1; }
dir="${dir:-/var/backups/tayari-kakshya}"
mkdir -p "$dir"/{daily,weekly,monthly,pre-deploy}
chmod 700 "$dir"

compose() { docker compose -f "$here/docker-compose.prod.yml" --env-file "$envfile" "$@"; }
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
case "$kind" in
  pre-deploy) target="$dir/pre-deploy/db-$stamp.dump.enc" ;;
  nightly) target="$dir/daily/db-$stamp.dump.enc" ;;
  *) echo "usage: backup.sh [nightly|pre-deploy]" >&2; exit 2 ;;
esac

# The passphrase reaches openssl through its environment, never the command line (ps would show it).
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' |
  BACKUP_PASSPHRASE="$passphrase" openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$target.part"
mv "$target.part" "$target"
chmod 600 "$target"
size="$(wc -c <"$target")"
[ "$size" -gt 1024 ] || { echo "Backup $target is suspiciously small ($size bytes)" >&2; exit 1; }
echo "$(date -u +%FT%TZ) backup $kind → $target ($size bytes)"

if [ "$kind" = nightly ]; then
  [ "$(date -u +%u)" = 7 ] && cp "$target" "$dir/weekly/"
  [ "$(date -u +%d)" = 01 ] && cp "$target" "$dir/monthly/"
fi

# Retention: newest N of each kind.
prune() {
  local files
  files="$(ls -1t "$1"/*.dump.enc 2>/dev/null || true)"
  [ -n "$files" ] || return 0
  printf '%s
' "$files" | tail -n +"$(($2 + 1))" | xargs -r rm -f
}
prune "$dir/daily" 7
prune "$dir/weekly" 4
prune "$dir/monthly" 6
prune "$dir/pre-deploy" 5

if [ -n "$remote" ]; then
  rclone sync "$dir" "$remote" --create-empty-src-dirs
  echo "$(date -u +%FT%TZ) copied off-site to $remote"
else
  echo "WARNING: BACKUP_RCLONE_REMOTE is empty — backups exist on this server only." >&2
fi
