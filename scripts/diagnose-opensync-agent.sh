#!/usr/bin/env bash
# Diagnóstico alinhado com o plano "README / ficheiro novo não aparecem na VM".
# Executar na máquina onde o agente OpenSync está configurado (ex.: VM Supersquad).
#
# Opcional: OPENSYNC_CONFIG=/caminho/dir  (directório com config.json e vault.token)
# Token: OPENSYNC_AGENT_API_KEY ou vault.token nesse directório.

set -euo pipefail

CONFIG_DIR="${OPENSYNC_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/opensync}"
CONFIG_JSON="$CONFIG_DIR/config.json"
TOKEN_FILE="$CONFIG_DIR/vault.token"

die() {
  echo "❌ $*" >&2
  exit 1
}

info() {
  echo "ℹ️  $*"
}

ok() {
  echo "✅ $*"
}

warn() {
  echo "⚠️  $*"
}

if [[ ! -f "$CONFIG_JSON" ]]; then
  die "config.json não encontrado: $CONFIG_JSON (defina OPENSYNC_CONFIG se estiver doutro sítio)"
fi

if [[ -n "${OPENSYNC_AGENT_API_KEY:-}" ]]; then
  TOKEN="$OPENSYNC_AGENT_API_KEY"
  info "Token: variável OPENSYNC_AGENT_API_KEY"
elif [[ -f "$TOKEN_FILE" ]]; then
  TOKEN="$(tr -d '\n\r' <"$TOKEN_FILE")"
  info "Token: $TOKEN_FILE"
else
  die "Token ausente: defina OPENSYNC_AGENT_API_KEY ou crie $TOKEN_FILE"
fi

if ! command -v python3 >/dev/null 2>&1; then
  die "python3 é necessário para ler config.json"
fi

eval "$(python3 <<PY
import json, urllib.parse
with open("$CONFIG_JSON") as f:
    c = json.load(f)
api = (c.get("apiUrl") or "").strip().rstrip("/")
vid = (c.get("vaultId") or "").strip()
sd = (c.get("syncDir") or "").strip()
if not api or not vid or not sd:
    raise SystemExit("config.json precisa de apiUrl, vaultId, syncDir")
base = api if api.endswith("/api") else api + "/api"
qvid = urllib.parse.quote(vid, safe="")
changes = f"{base}/agent/vaults/{qvid}/changes?cursor="
print(f"API_URL={api!r}")
print(f"BASE={base!r}")
print(f"VAULT_ID={vid!r}")
print(f"SYNC_DIR={sd!r}")
print(f"CHANGES_URL={changes!r}")
PY
)"

# Strip quotes from eval output - python used repr. Actually the print uses repr so we get single-quoted strings. eval should work.

echo ""
echo "========== 1) API /changes (esperado HTTP 200) =========="
echo "URL base: $BASE"
echo "vaultId:  $VAULT_ID"
if ! command -v curl >/dev/null 2>&1; then
  warn "curl não instalado — não foi possível testar /changes"
else
  TMP_BODY="$(mktemp)"
  set +e
  HTTP_CODE="$(curl -sS -o "$TMP_BODY" -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "$CHANGES_URL")"
  CURL_EC=$?
  set -e
  if [[ "$CURL_EC" -ne 0 ]]; then
    HTTP_CODE="000"
  fi
  echo "HTTP: $HTTP_CODE"
  case "$HTTP_CODE" in
    200) ok "API acessível com este token e vaultId" ;;
    401|403) warn "Autenticação falhou — regenere o token (opensync init) ou confirme o vault" ;;
    000) warn "Ligação falhou (rede, URL errada, ou API não alcançável a partir desta máquina)" ;;
    *) warn "Resposta inesperada — ver corpo abaixo" ;;
  esac
  if [[ -s "$TMP_BODY" ]]; then
    echo "--- corpo (primeiras 800 chars) ---"
    head -c 800 "$TMP_BODY" || true
    echo ""
    echo "---"
  fi
  rm -f "$TMP_BODY"
fi

echo ""
echo "========== 2) syncDir e ficheiros (README / teste) =========="
echo "syncDir: $SYNC_DIR"
if [[ ! -d "$SYNC_DIR" ]]; then
  warn "syncDir não existe ou não é directório — o agente não pode escrever aqui"
else
  ok "syncDir existe"
  echo "--- listagem (até 80 ficheiros, find -type f) ---"
  find "$SYNC_DIR" -type f 2>/dev/null | head -80 || true
  echo "--- procura README.md / teste*.txt ---"
  find "$SYNC_DIR" -type f \( -name 'README.md' -o -name 'teste.txt' -o -name 'test.txt' \) 2>/dev/null || true
fi

echo ""
echo "========== 3) Logs opensync-ubuntu (systemd --user) =========="
if command -v journalctl >/dev/null 2>&1; then
  if OUT="$(journalctl --user -u opensync-ubuntu -n 80 --no-pager 2>/dev/null)" && [[ -n "$OUT" ]]; then
    echo "$OUT"
  else
    warn "Sem entradas ou unidade não encontrada. Tente: systemctl --user status opensync-ubuntu"
  fi
else
  warn "journalctl não disponível"
fi

echo ""
echo "========== 4) Lembrete: vaultId na web =========="
echo "Compare o vaultId acima com o da URL do vault no browser (deve ser igual)."
echo "Se a web usa localhost e esta máquina é uma VM remota, apiUrl não pode ser só localhost do teu PC."
echo ""
ok "Diagnóstico concluído."
