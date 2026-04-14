import { NextResponse } from "next/server";

import { getPublicAppOriginForServer, resolveUbuntuDebDownloadUrlForServer } from "@/lib/opensync-public-urls";

function isAllowedDebUrl(parsed: URL): boolean {
  if (parsed.protocol === "https:") return true;
  if (process.env.NODE_ENV !== "development") return false;
  if (parsed.protocol !== "http:") return false;
  const host = parsed.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** Escapa uma string para uso dentro de aspas simples em bash. */
function bashSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildInstallScript(debUrl: string, webOrigin: string): string {
  const quoted = bashSingleQuoted(debUrl);
  const quotedOrigin = bashSingleQuoted(webOrigin.replace(/\/+$/, ""));
  return `#!/usr/bin/env bash
set -euo pipefail

# Cores (ANSI) — $'…' para o bash interpretar \\x1b
R=$'\\x1b[0;31m'; G=$'\\x1b[0;32m'; Y=$'\\x1b[1;33m'; B=$'\\x1b[0;34m'
C=$'\\x1b[0;36m'; M=$'\\x1b[0;35m'; D=$'\\x1b[0;90m'; N=$'\\x1b[0m'

say() { printf '%b\\n' "\$@"; }
hdr() { say "\${C}\${B}━━━ \$* ━━━\${N}"; }
ok()  { say "\${G}✅ \$*\${N}"; }
warn(){ say "\${Y}⚠️  \$*\${N}"; }
err() { say "\${R}❌ \$*\${N}" >&2; }

# Major do pacote apt 'nodejs' (o .deb declara Depends: nodejs >= 20)
apt_nodejs_major() {
  local st ver
  st=\$(dpkg-query -W -f='\${Status}' nodejs 2>/dev/null || true)
  [[ "\$st" == *"ok installed"* ]] || { echo 0; return; }
  ver=\$(dpkg-query -W -f='\${Version}' nodejs 2>/dev/null || true)
  if [[ "\$ver" =~ ^([0-9]+) ]]; then echo "\${BASH_REMATCH[1]}"; else echo 0; fi
}

# Primeira componente de versão do 'node' no PATH (nvm/fnm/etc.) — não satisfaz o dpkg sozinha
path_node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -p 'parseInt(process.version.slice(1).split(".")[0],10)' 2>/dev/null || echo 0
}

OPENSYNC_WEB_ORIGIN=${quotedOrigin}
DEB_URL=${quoted}

[[ -t 1 ]] && clear || true
say ""
hdr "🚀 OpenSync — instalador Ubuntu"
say "\${D}Este script descarrega o pacote oficial e prepara o assistente.\${N}"
say ""

arch="\$(uname -m)"
if [[ "\$arch" != "x86_64" ]]; then
  err "Arquitectura não suportada (\$arch). Só amd64 (x86_64)."
  exit 1
fi
ok "Arquitectura x86_64 — OK"

say ""
hdr "📦 Pré-requisito: Node.js 20+ (pacote apt 'nodejs')"
say "O pacote 'opensync-ubuntu' declara Depends no pacote apt 'nodejs' >= 20. O dpkg não olha para nvm/fnm/snap no teu PATH."
maj=\$(apt_nodejs_major)
path_maj=\$(path_node_major)
if [[ "\$maj" -lt 20 ]]; then
  warn "Pacote apt 'nodejs': série principal \${maj:-0} (precisa >= 20)."
  if [[ "\$path_maj" -ge 20 ]]; then
    say ""
    say "\${C}ℹ️  O teu 'node' no terminal já é v\${path_maj}+ (muito provavelmente nvm, fnm ou binário fora do apt).\${N}"
    say "   Mesmo assim o dpkg só aceita o .deb se o pacote apt 'nodejs' for >= 20."
    say "   Isto não remove o teu nvm: o apt instala/atualiza o pacote do sistema em paralelo."
    say ""
  fi
  say "\${M}O que fazer:\${N}"
  say "  \${B}1)\${N} Subir o pacote apt 'nodejs' para 20+ (ex.: NodeSource):"
  say "     \${C}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\${N}"
  say "     \${C}sudo apt-get install -y nodejs\${N}"
  say ""
  say "  \${B}2)\${N} Confirma o apt, não só \${C}node -v\${N}:"
  say "     \${C}apt-cache policy nodejs\${N}  (versão instalada / candidata deve ser 20+)"
  say ""
  say "  \${B}3)\${N} Volta a correr:"
  say "     \${C}curl -fsSL \${OPENSYNC_WEB_ORIGIN}/install/ubuntu | bash\${N}"
  say ""
  err "Instalação cancelada até o pacote apt 'nodejs' satisfazer o dpkg (>= 20)."
  exit 1
fi
ok "Pacote apt nodejs satisfaz (principal >= 20)."

tmpdir="\$(mktemp -d)"
trap 'rm -rf "\$tmpdir"' EXIT

say ""
hdr "⬇️  A descarregar o pacote"
say "\${D}\$DEB_URL\${N}"
if ! curl -fL --progress-bar "\$DEB_URL" -o "\$tmpdir/opensync-ubuntu.deb"; then
  err "Falha ao descarregar o .deb. Verifica a ligação à Internet e a URL."
  exit 1
fi
ok "Pacote descarregado."

say ""
hdr "📥 A instalar com dpkg"
warn "Pode ser pedida a palavra-passe sudo."
if ! sudo dpkg -i "\$tmpdir/opensync-ubuntu.deb"; then
  say ""
  err "O dpkg -i falhou (dependências ou ficheiro corrompido)."
  say "\${Y}Não corremos apt-get install -f automaticamente — isso costuma remover o pacote em conflito.\${N}"
  say "Revisa os erros em cima, corrige dependências (ex.: Node 20+) e tenta de novo."
  exit 1
fi

if ! dpkg-query -W -f='\${Status}' opensync-ubuntu 2>/dev/null | grep -q 'ok installed'; then
  err "O pacote 'opensync-ubuntu' não ficou em estado \"install ok installed\"."
  exit 1
fi

say ""
say "\${G}\${B}🎉 Pacote opensync-ubuntu instalado com sucesso!\${N}"
say ""

# curl | bash liga o stdin ao pipe; read/init precisam do /dev/tty
if [[ -r /dev/tty ]]; then
  exec 0</dev/tty
else
  warn "Sem /dev/tty — exporte OPENSYNC_WORKSPACE_TOKEN=usk_... e corre: \${C}opensync-ubuntu init\${N}"
  exit 0
fi

hdr "🔑 Token de workspace (usk_...)"
say "Gera o token no painel (fica à espera até colares e carregares Enter)."
say "\${C}\${OPENSYNC_WEB_ORIGIN}/settings?section=access-tokens\${N}"
say ""
say "\${D}O assistente opensync-ubuntu init usa esta variável e continua com pasta e vault.\${N}"
say ""

while true; do
  say "\${Y}Cole o token usk_ e carregue Enter:\${N}"
  if ! read -r OPENSYNC_WORKSPACE_TOKEN; then
    err "Leitura cancelada."
    exit 1
  fi
  OPENSYNC_WORKSPACE_TOKEN=\$(printf '%s' "\$OPENSYNC_WORKSPACE_TOKEN" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  export OPENSYNC_WORKSPACE_TOKEN
  if [[ -z "\$OPENSYNC_WORKSPACE_TOKEN" ]]; then
    say "\${D}A aguardar… gera o token no painel e cola aqui.\${N}"
    continue
  fi
  if [[ "\$OPENSYNC_WORKSPACE_TOKEN" != usk_* ]]; then
    warn "O token tem de comecar com usk_. Tenta de novo."
    continue
  fi
  break
done

say ""
ok "Token recebido. A abrir o assistente (vault, pasta, systemd)…"
say ""

opensync-ubuntu init
`;
}

/**
 * Script de instalação do pacote opensync-ubuntu (descarrega .deb de URL configurada no servidor).
 * Uso: curl -fsSL "https://opensync.space/install/ubuntu" | bash
 */
export async function GET() {
  const raw = resolveUbuntuDebDownloadUrlForServer();

  let parsed: URL;
  try {
    parsed = new URL(raw);
    if (!isAllowedDebUrl(parsed)) {
      return new NextResponse(
        "OpenSync: OPENSYNC_UBUNTU_DEB_URL deve ser https:// (em desenvolvimento também é aceite http://localhost ou 127.0.0.1).\n",
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
  } catch {
    return new NextResponse(
      "OpenSync: OPENSYNC_UBUNTU_DEB_URL não é uma URL válida.\n",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const body = buildInstallScript(parsed.toString(), getPublicAppOriginForServer());

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'inline; filename="install-opensync-ubuntu.sh"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
