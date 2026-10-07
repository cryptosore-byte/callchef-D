#!/usr/bin/env bash
# One-line install on a fresh VPS (repo must be public):
#   curl -fsSL https://raw.githubusercontent.com/cryptosore-byte/callchef-D/claude/jev-typesafe-integration-w76xso/restaurant-radar/deploy/install.sh | sudo bash
set -euo pipefail
BRANCH="${BRANCH:-claude/jev-typesafe-integration-w76xso}"
DIR=/opt/restaurant-radar
apt-get update -y >/dev/null && apt-get install -y curl tar ca-certificates >/dev/null
tmp="$(mktemp -d)"
curl -fsSL "https://codeload.github.com/cryptosore-byte/callchef-D/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$tmp"
mkdir -p "$DIR"
[ -f "$DIR/.env.local" ] && cp "$DIR/.env.local" "$tmp/env.keep"
cp -a "$tmp"/*/restaurant-radar/. "$DIR"/
[ -f "$tmp/env.keep" ] && cp "$tmp/env.keep" "$DIR/.env.local"
rm -rf "$tmp"
# stdin is the curl pipe: read the prompts from the terminal
bash "$DIR/deploy/setup-vps.sh" < /dev/tty
