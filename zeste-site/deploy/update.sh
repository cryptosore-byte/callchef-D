#!/usr/bin/env bash
# Met à jour Zeste sur le VPS (installation Docker derrière le Caddy de sel-crm).
# Usage : bash update.sh                  télécharge la dernière version depuis GitHub et relance
#         bash update.sh --restart        relance seulement (après avoir modifié /etc/zeste/zeste.env)
#         bash update.sh --rollback       revient à la version d'avant la dernière mise à jour
#         bash update.sh --version <ref>  installe une version précise (commit GitHub), ex. 35d7b1a5…
# Avant chaque changement, la version en place est copiée dans /opt/zeste-backups (5 dernières gardées).
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo "Lance ce script en root." >&2; exit 1; }
BRANCH="${ZESTE_BRANCH:-claude/clever-heisenberg-zh277j}"
URL="https://github.com/cryptosore-byte/callchef-D/archive/refs/heads/$BRANCH.tar.gz"
MODE="${1:-}"
if [[ "$MODE" == "--version" ]]; then
  REF="${2:?Indique la version : bash update.sh --version <commit>}"
  [[ "$REF" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Version invalide." >&2; exit 1; }
  URL="https://github.com/cryptosore-byte/callchef-D/archive/$REF.tar.gz"
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# Backups are /opt/zeste-backups/YYYYMMDD-HHMMSS; names are validated before any removal.
STAMP='^[0-9]{8}-[0-9]{6}$'
backups(){ find /opt/zeste-backups -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | grep -E "$STAMP" | sort || true; }

backup(){
  [[ -f /opt/zeste/dist/index.html ]] || return 0
  local name; name="$(date +%Y%m%d-%H%M%S)"
  install -d -m 755 "/opt/zeste-backups/$name"
  rsync -a /opt/zeste/dist /opt/zeste/deploy "/opt/zeste-backups/$name/"
  local old
  for old in $(backups | head -n -5); do
    [[ "$old" =~ $STAMP ]] && rm -rf -- "/opt/zeste-backups/$old"
  done
  echo "==> Sauvegarde : /opt/zeste-backups/$name"
}

if [[ "$MODE" == "--rollback" ]]; then
  LAST="$(backups | tail -n 1)"
  [[ "$LAST" =~ $STAMP ]] || { echo "Aucune sauvegarde dans /opt/zeste-backups." >&2; exit 1; }
  echo "==> Retour à la sauvegarde du $LAST"
  rsync -a --delete "/opt/zeste-backups/$LAST/dist/" /opt/zeste/dist/
  rsync -a --delete "/opt/zeste-backups/$LAST/deploy/" /opt/zeste/deploy/
  rm -rf -- "/opt/zeste-backups/$LAST"
  chmod -R a+rX /opt/zeste
elif [[ "$MODE" != "--restart" ]]; then
echo "==> Téléchargement"
curl -fsSL -o "$TMP/zeste.tar.gz" "$URL"
tar xzf "$TMP/zeste.tar.gz" -C "$TMP" --strip-components=1
[[ -f "$TMP/zeste-site/dist/index.html" ]] || { echo "Archive inattendue." >&2; exit 1; }

backup
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
