import { NextResponse } from "next/server";

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

function buildInstallScript(debUrl: string): string {
  const quoted = bashSingleQuoted(debUrl);
  return `#!/usr/bin/env bash
set -euo pipefail

arch="$(uname -m)"
if [[ "$arch" != "x86_64" ]]; then
  echo "opensync-ubuntu: arquitetura não suportada ($arch). Apenas amd64 (x86_64)." >&2
  exit 1
fi

DEB_URL=${quoted}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "A descarregar o pacote OpenSync..."
curl -fsSL "$DEB_URL" -o "$tmpdir/opensync-ubuntu.deb"

echo "A instalar (pode ser-lhe pedida a palavra-passe sudo)..."
if ! sudo dpkg -i "$tmpdir/opensync-ubuntu.deb"; then
  sudo apt-get install -f -y
fi

echo ""
echo "Instalação do pacote concluída."
echo "A seguir: assistente opensync-ubuntu init (e-mail, token usk_..., pasta, vault)."
echo "Token de workspace: https://opensync.space/settings?section=access-tokens"
echo ""

# curl | bash liga o stdin ao pipe; o wizard interativo precisa do terminal.
if [[ -r /dev/tty ]]; then
  exec 0</dev/tty
fi
opensync-ubuntu init
`;
}

/**
 * Script de instalação do pacote opensync-ubuntu (descarrega .deb de URL configurada no servidor).
 * Uso: curl -fsSL "https://opensync.space/install/ubuntu" | bash
 */
export async function GET() {
  const raw = (process.env.OPENSYNC_UBUNTU_DEB_URL ?? "").trim();
  if (!raw) {
    return new NextResponse(
      "OpenSync: instalador indisponível — OPENSYNC_UBUNTU_DEB_URL não está definido no servidor.\n",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

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

  const body = buildInstallScript(parsed.toString());

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
