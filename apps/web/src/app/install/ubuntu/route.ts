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

OPENSYNC_WEB_ORIGIN=${quotedOrigin}
DEB_URL=${quoted}

[[ -t 1 ]] && clear || true
say ""
hdr "🚀 OpenSync — instalador Ubuntu (binário Rust)"
say "\${D}Este script descarrega o pacote oficial e prepara o assistente.\${N}"
say ""

arch="\$(uname -m)"
if [[ "\$arch" != "x86_64" ]]; then
  err "Arquitectura não suportada (\$arch). Só amd64 (x86_64)."
  exit 1
fi
ok "Arquitectura x86_64 — OK"

# Detectar instalação anterior (Node) e remover de forma controlada — o pacote novo
# (Rust, nome 'opensync') declara Conflicts/Replaces/Provides: opensync-ubuntu, mas
# avisar o utilizador deixa o output mais claro.
if dpkg-query -W -f='\${Status}' opensync-ubuntu 2>/dev/null | grep -q 'ok installed'; then
  warn "Detetada instalação anterior 'opensync-ubuntu' (Node.js) — será substituída pelo binário Rust."
fi

tmpdir="\$(mktemp -d)"
trap 'rm -rf "\$tmpdir"' EXIT

say ""
hdr "⬇️  A descarregar o pacote"
say "\${D}\$DEB_URL\${N}"
if ! curl -fL --progress-bar "\$DEB_URL" -o "\$tmpdir/opensync.deb"; then
  err "Falha ao descarregar o .deb. Verifica a ligação à Internet e a URL."
  exit 1
fi
ok "Pacote descarregado."

say ""
hdr "📥 A instalar com dpkg"
warn "Pode ser pedida a palavra-passe sudo."
if ! sudo dpkg -i "\$tmpdir/opensync.deb"; then
  say ""
  err "O dpkg -i falhou (dependências do sistema ou ficheiro corrompido)."
  say "\${Y}Tenta resolver dependências em falta com:\${N} \${C}sudo apt-get -f install\${N}"
  exit 1
fi

if ! dpkg-query -W -f='\${Status}' opensync 2>/dev/null | grep -q 'ok installed'; then
  err "O pacote 'opensync' não ficou em estado \"install ok installed\"."
  exit 1
fi

say ""
say "\${G}\${B}🎉 Pacote opensync (Rust) instalado com sucesso!\${N}"
say ""

# curl | bash: o stdin do bash é o pipe do curl — NÃO uses 'exec 0</dev/tty' no meio do script
# (o bash pode deixar de ler o resto do script). Lê sempre de </dev/tty> e passa o tty ao init.
if [[ ! -r /dev/tty ]]; then
  warn "Sem /dev/tty — exporte OPENSYNC_WORKSPACE_TOKEN=usk_... e corre: \${C}opensync init\${N}"
  exit 0
fi

hdr "🔑 Token de workspace (usk_...)"
say "Gera o token no painel (fica à espera até colares e carregares Enter)."
say "\${C}\${OPENSYNC_WEB_ORIGIN}/settings?section=access-tokens\${N}"
say ""
say "\${D}O assistente opensync init usa esta variável e continua com pasta e vault.\${N}"
say ""

while true; do
  say "\${Y}Cole o token usk_ e carregue Enter:\${N}"
  if ! IFS= read -r OPENSYNC_WORKSPACE_TOKEN < /dev/tty; then
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

opensync init < /dev/tty
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
