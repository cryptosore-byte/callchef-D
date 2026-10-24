#!/usr/bin/env bash
# Met à jour Zeste sur le VPS (installation Docker derrière le Caddy de sel-crm).
# Usage : bash update.sh            télécharge la dernière version depuis GitHub et relance
#         bash update.sh --restart  relance seulement (après avoir modifié /etc/zeste/zeste.env)
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo "Lance ce script en root." >&2; exit 1; }
BRANCH="${ZESTE_BRANCH:-claude/clever-heisenberg-zh277j}"
URL="https://github.com/cryptosore-byte/callchef-D/archive/refs/heads/$BRANCH.tar.gz"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

if [[ "${1:-}" != "--restart" ]]; then
echo "==> Téléchargement"
curl -fsSL -o "$TMP/zeste.tar.gz" "$URL"
tar xzf "$TMP/zeste.tar.gz" -C "$TMP" --strip-components=1
[[ -f "$TMP/zeste-site/dist/index.html" ]] || { echo "Archive inattendue." >&2; exit 1; }

echo "==> Fichiers"
rsync -a --delete "$TMP/zeste-site/dist/" /opt/zeste/dist/
rsync -a --delete "$TMP/zeste-site/deploy/" /opt/zeste/deploy/
chmod -R a+rX /opt/zeste
fi

# Recreated each time so changes to /etc/zeste/zeste.env are picked up (an env file is read at creation).
echo "==> Redémarrage"
docker rm -f zeste-site >/dev/null 2>&1 || true
docker run -d --name zeste-site --restart unless-stopped --network sel-crm_default \
  --env-file /etc/zeste/zeste.env -e BIND=0.0.0.0 -e PORT=8099 -e TRUST_PROXY=1 \
  -v /opt/zeste:/app:ro --read-only --cap-drop ALL --security-opt no-new-privileges --user 65534:65534 \
  python:3.12-slim python3 -I /app/deploy/server.py >/dev/null
sleep 3
if STATUS="$(docker exec sel-crm-caddy-1 wget -qO- http://zeste-site:8099/api/contact-status)"; then
  echo "Zeste à jour : https://zeste.delivery"
  [[ "$STATUS" == *true* ]] && echo "Formulaire : actif" || echo "Formulaire : en aperçu (à configurer dans /etc/zeste/zeste.env)"
else
  echo "!! Zeste ne répond pas : docker logs --tail 30 zeste-site" >&2; exit 1
fi
