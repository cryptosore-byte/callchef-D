#!/usr/bin/env bash
# One-shot install of Restaurant Radar on an Ubuntu/Debian VPS (e.g. Hostinger).
# Run from the restaurant-radar folder:  sudo bash deploy/setup-vps.sh
# Keys are typed at the prompt (hidden) and stored only in .env.local (chmod 600).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  echo "== Installing Node.js 20"
  apt-get update -y && apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if [ ! -f .env.local ]; then
  echo "== Keys (input hidden; leave empty to skip)"
  read -rsp "APIFY_API_TOKEN: " APIFY; echo
  read -rsp "TYPESAFE_API_KEY: " JEV; echo
  read -rsp "Site password (protects your Apify credit): " PASS; echo
  umask 077
  {
    [ -n "$APIFY" ] && echo "APIFY_API_TOKEN=$APIFY"
    [ -n "$JEV" ] && echo "TYPESAFE_API_KEY=$JEV"
    [ -n "$PASS" ] && echo "SITE_PASSWORD=$PASS"
    echo "CACHE_DIR=$(pwd)/.cache"
  } > .env.local
  if [ -z "$PASS" ]; then echo "WARNING: no site password, anyone with the URL can launch paid scans."; fi
fi

echo "== Building"
npm ci --no-audit --no-fund
npm run build

echo "== Starting with pm2 (restarts on reboot)"
command -v pm2 >/dev/null || npm install -g pm2
pm2 delete restaurant-radar >/dev/null 2>&1 || true
PORT="$PORT" pm2 start npm --name restaurant-radar -- start -- -p "$PORT"
pm2 save
pm2 startup systemd -u "$(whoami)" --hp "$HOME" >/dev/null 2>&1 || true
command -v ufw >/dev/null && ufw allow "$PORT"/tcp >/dev/null 2>&1 || true

IP="$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
echo
echo "Ready: http://$IP:$PORT  (logs: pm2 logs restaurant-radar)"
