#!/usr/bin/env bash
# Restores an encrypted backup into a NEW database (never over the live one), guide §9.
#   infra/production/restore.sh <file.dump.enc>          restore into tayari_kakshya_restore_<date> and report counts
#   infra/production/restore.sh <file.dump.enc> --drill   the same, then drop it again (monthly restore drill)
# After a real restore: stop api / worker, point DATABASE_URL at the restored database (or rename databases), start
# them again, and note what was lost since the backup.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
envfile="$here/.env"
file="${1:?usage: restore.sh <file.dump.enc> [--drill]}"
drill=false
[ "${2:-}" = "--drill" ] && drill=true
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }
passphrase="$(grep -E '^BACKUP_PASSPHRASE=' "$envfile" | cut -d= -f2-)"
compose() { docker compose -f "$here/docker-compose.prod.yml" --env-file "$envfile" "$@"; }

target="tayari_kakshya_restore_$(date -u +%Y%m%d%H%M%S)"
echo "==> Creating database $target"
compose exec -T postgres sh -c "createdb -U \"\$POSTGRES_USER\" $target"

echo "==> Restoring $file"
BACKUP_PASSPHRASE="$passphrase" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" |
  compose exec -T postgres sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $target --no-owner --exit-on-error"

echo "==> Check"
compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d $target -tA -c \"select 'migrations', count(*) from _prisma_migrations union all select 'users', count(*) from users union all select 'orders', count(*) from orders union all select 'audit_logs', count(*) from audit_logs\""

if $drill; then
  compose exec -T postgres sh -c "dropdb -U \"\$POSTGRES_USER\" $target"
  echo "==> Drill passed: the backup restores; $target was removed."
else
  echo "==> Restored into $target. Point DATABASE_URL at it to use it (see the header of this script)."
fi
