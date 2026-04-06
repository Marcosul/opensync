#!/usr/bin/env bash
# Verifica se o projeto Supabase do .env tem Google OAuth ativo e se /authorize responde sem erro 400.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=/dev/null
set -a && . ./.env && set +a

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:-}${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "FAIL: defina NEXT_PUBLIC_SUPABASE_URL e uma chave publica (anon ou publishable) em .env"
  exit 1
fi

KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY}}"

SETTINGS=$(curl -sS "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings" \
  -H "apikey: ${KEY}" \
  -H "Authorization: Bearer ${KEY}")

GOOGLE=$(echo "$SETTINGS" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(String(j.external.google));")
echo "auth/v1/settings external.google=${GOOGLE}"

REDIRECT="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}/auth/callback"
ENC_REDIRECT=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$REDIRECT")
AUTH_URL="${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${ENC_REDIRECT}"

BODY=$(curl -sS "$AUTH_URL" -w "\n%{http_code}")
HTTP_CODE=$(echo "$BODY" | tail -n1)
JSON_BODY=$(echo "$BODY" | sed '$d')

echo "authorize http_code=${HTTP_CODE}"
if [[ "$HTTP_CODE" == "400" ]]; then
  echo "$JSON_BODY"
  echo "FAIL: Google OAuth nao esta disponivel neste projeto (veja mensagem acima)."
  exit 1
fi

if [[ "$GOOGLE" != "true" ]]; then
  echo "WARN: settings ainda mostra google=false; confira Auth > Providers no dashboard."
  exit 1
fi

echo "OK: Google OAuth ativo para este NEXT_PUBLIC_SUPABASE_URL."
exit 0
