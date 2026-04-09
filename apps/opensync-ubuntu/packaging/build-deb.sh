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
pnpm --filter @opensync/opensync-ubuntu exec tsc -p "$ROOT/tsconfig.json"
DEPLOY="$STAGE/usr/lib/opensync-ubuntu"
rm -rf "$DEPLOY"
pnpm --filter @opensync/opensync-ubuntu deploy --legacy "$DEPLOY"

cat >"$STAGE/usr/bin/opensync-ubuntu" <<'WRAP'
#!/bin/sh
exec node /usr/lib/opensync-ubuntu/dist/cli.js "$@"
WRAP
chmod 755 "$STAGE/usr/bin/opensync-ubuntu"

cp "$ROOT/packaging/debian/opensync-ubuntu.service" "$STAGE/lib/systemd/user/opensync-ubuntu.service"

dpkg-deb --root-owner-group --build "$STAGE" "$ROOT/packaging/${PKG}.deb"
echo "Built $ROOT/packaging/${PKG}.deb"
sha256sum "$ROOT/packaging/${PKG}.deb" | tee "$ROOT/packaging/${PKG}.deb.sha256"
