#!/usr/bin/env bash
# Installs Playwright's Chromium and its system packages for one app (e.g. @tk/admin).
# The runner's apt mirror sometimes stops answering and `apt-get update` then waits forever, until the job's
# 20-minute limit cancels the whole job (seen 2026-10-07). Give apt time limits and retries, cap each attempt,
# and try up to three times.
set -uo pipefail
app="$1"

sudo tee /etc/apt/apt.conf.d/99ci-timeouts > /dev/null <<'APT'
Acquire::Retries "3";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
DPkg::Lock::Timeout "120";
APT

for attempt in 1 2 3; do
  echo "Installing Chromium for $app (attempt $attempt)"
  if timeout -k 15 300 pnpm --filter "$app" exec playwright install --with-deps chromium; then
    exit 0
  fi
  echo "::warning::Playwright install attempt $attempt for $app failed or timed out"
  sleep 10
done
echo "::error::Playwright install for $app failed after 3 attempts"
exit 1
