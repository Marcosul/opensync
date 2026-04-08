#!/usr/bin/env bash
# OpenSync: push do estado local para o repositório Gitea do vault (a partir da VPS OpenClaw).
# Documentação: docs/dev/openclaw-agent-sync.md
#
# Uso típico (variáveis de exemplo):
#   export OPENSYNC_REPO_DIR="$HOME/openclaw-vault-sync"
#   export OPENSYNC_GIT_BRANCH="${OPENSYNC_GIT_BRANCH:-main}"
#   export GIT_SSH_COMMAND='ssh -i /root/.ssh/opensync_vault_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
#
set -euo pipefail

REPO_DIR="${OPENSYNC_REPO_DIR:-}"
BRANCH="${OPENSYNC_GIT_BRANCH:-main}"

if [[ -z "$REPO_DIR" || ! -d "$REPO_DIR/.git" ]]; then
  echo "opensync-vps-git-sync: defina OPENSYNC_REPO_DIR para um clone git valido" >&2
  exit 1
fi

cd "$REPO_DIR"

git fetch origin "$BRANCH" --quiet || true
git pull --rebase origin "$BRANCH" || {
  echo "opensync-vps-git-sync: pull --rebase falhou; resolva conflitos manualmente" >&2
  exit 2
}

if git diff --quiet && git diff --cached --quiet; then
  echo "opensync-vps-git-sync: nada a commitar"
  exit 0
fi

git add -A
git commit -m "chore(agent): sync from OpenClaw host $(hostname -s) $(date -u +%Y-%m-%dT%H:%MZ)" || true

git push origin "HEAD:${BRANCH}"

echo "opensync-vps-git-sync: push concluido para origin/${BRANCH}"
