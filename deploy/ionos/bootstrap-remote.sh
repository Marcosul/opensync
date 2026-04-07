#!/usr/bin/env bash
# Run ON the VPS once (as root). Installs Docker, writes gitea.env from PUBLIC_HOST, starts Gitea.
set -euo pipefail

PUBLIC_HOST="${1:?Usage: bootstrap-remote.sh <PUBLIC_HOST_ipv4_or_dns>}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io
fi
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-v2
fi

systemctl enable docker
systemctl start docker

BOOT_DIR="/opt/opensync"
mkdir -p "$BOOT_DIR/gitea-data"
chmod 755 "$BOOT_DIR" "$BOOT_DIR/gitea-data"

if [[ ! -f "$BOOT_DIR/docker-compose.yml" ]]; then
  echo "Missing $BOOT_DIR/docker-compose.yml — copy deploy/ionos from the repo first." >&2
  exit 1
fi

cat >"$BOOT_DIR/gitea.env" <<EOF
USER_UID=1000
USER_GID=1000
GITEA__database__DB_TYPE=sqlite3
GITEA__server__HTTP_PORT=3000
GITEA__server__SSH_LISTEN_PORT=22
GITEA__server__ROOT_URL=http://${PUBLIC_HOST}:3000/
GITEA__server__DOMAIN=${PUBLIC_HOST}
GITEA__server__SSH_DOMAIN=${PUBLIC_HOST}
GITEA__server__SSH_PORT=2222
EOF
chmod 600 "$BOOT_DIR/gitea.env"

cd "$BOOT_DIR"
if docker compose version >/dev/null 2>&1; then
  docker compose up -d
elif docker-compose version >/dev/null 2>&1; then
  docker-compose up -d
else
  echo "docker compose not available" >&2
  exit 1
fi

echo ""
echo "✅ Gitea em execução. UI: http://${PUBLIC_HOST}:3000/"
echo "   Git SSH (host): port 2222"
echo "   Dados: ${BOOT_DIR}/gitea-data"
