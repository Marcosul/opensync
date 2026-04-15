#!/usr/bin/env bash
# Constrói um .deb simples (requer: pnpm, node, dpkg-deb).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
VER="${1:-0.1.0}"
ARCH=amd64
PKG=opensync-ubuntu_${VER}_${ARCH}
STAGE="$ROOT/packaging/stage/$PKG"

rm -rf "$STAGE"
mkdir -p "$STAGE/DEBIAN" "$STAGE/usr/lib/opensync-ubuntu" "$STAGE/usr/bin" "$STAGE/lib/systemd/user"

cat >"$STAGE/DEBIAN/control" <<EOF
Package: opensync-ubuntu
Version: $VER
Section: utils
Priority: optional
Architecture: $ARCH
Maintainer: OpenSync <hello@opensync.space>
Depends: nodejs (>= 20)
Description: OpenSync Ubuntu - sync bidirecional de qualquer pasta com vault
 Sincroniza qualquer diretorio local com um vault OpenSync. Sem OpenClaw, skill ou plugin.
EOF

cd "$REPO_ROOT"
pnpm install --frozen-lockfile
cd "$ROOT" && pnpm exec tsc && cd "$REPO_ROOT"
DEPLOY="$STAGE/usr/lib/opensync-ubuntu"
rm -rf "$DEPLOY"
pnpm --filter @opensync/opensync-ubuntu deploy --legacy "$DEPLOY"

# Compilar binários nativos (better-sqlite3) no diretório de deploy
cd "$DEPLOY"
npm rebuild better-sqlite3 --ignore-scripts=false
cd "$REPO_ROOT"

cat >"$STAGE/DEBIAN/postinst" <<'POSTINST'
#!/bin/sh
set -e

APP_DIR="/usr/lib/opensync-ubuntu"

if [ -d "$APP_DIR" ]; then
  printf '%s\n' "🔧 [postinst] A alinhar binarios nativos com o Node da maquina..."
  # Rebuild no host garante ABI compativel com a versao de nodejs instalada no sistema.
  if ! npm rebuild --prefix "$APP_DIR" better-sqlite3 --ignore-scripts=false >/dev/null 2>&1; then
    printf '%s\n' "❌ [postinst] Falha ao reconstruir better-sqlite3 para o Node atual."
    printf '%s\n' "   Execute: sudo npm rebuild --prefix $APP_DIR better-sqlite3 --ignore-scripts=false"
    exit 1
  fi
  printf '%s\n' "✅ [postinst] better-sqlite3 recompilado com sucesso."
fi

exit 0
POSTINST
chmod 755 "$STAGE/DEBIAN/postinst"

cat >"$STAGE/usr/bin/opensync-ubuntu" <<'WRAP'
#!/bin/sh
exec node /usr/lib/opensync-ubuntu/dist/cli.js "$@"
WRAP
chmod 755 "$STAGE/usr/bin/opensync-ubuntu"

cat >"$STAGE/usr/bin/opensync" <<'WRAP'
#!/bin/sh
exec node /usr/lib/opensync-ubuntu/dist/cli.js "$@"
WRAP
chmod 755 "$STAGE/usr/bin/opensync"

cp "$ROOT/packaging/debian/opensync-ubuntu.service" "$STAGE/lib/systemd/user/opensync-ubuntu.service"

dpkg-deb --root-owner-group --build "$STAGE" "$ROOT/packaging/${PKG}.deb"
echo "Built $ROOT/packaging/${PKG}.deb"
sha256sum "$ROOT/packaging/${PKG}.deb" | tee "$ROOT/packaging/${PKG}.deb.sha256"
