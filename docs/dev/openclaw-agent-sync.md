# Sincronizar a VPS OpenClaw com o repositório Gitea do vault

Este documento alinha a automação **no lado do OpenClaw** com o modelo OpenSync (Gitea por vault + deploy key).

## Pré-requisitos

1. Vault criado no OpenSync (repo Gitea já existe).
2. **Deploy key** gerada no dashboard: ver [vault-git-api.md](./vault-git-api.md) — guardar a chave privada **só na VPS** (ex.: `/root/.ssh/opensync_vault_<id>_ed25519`, `chmod 600`).
3. `git` instalado na VPS (`apt install git` ou imagem base que já inclua).

## Clone inicial na VPS

Substitua `git@HOST:owner/repo.git` pelo URL SSH mostrado na resposta da API (ou `GITEA_SSH_HOST` + `giteaRepo`).

```bash
export GIT_SSH_COMMAND='ssh -i /root/.ssh/opensync_vault_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
git clone git@HOST:owner/repo.git ~/openclaw-vault-sync
cd ~/openclaw-vault-sync
```

Para espelhar **só** o workspace OpenClaw, pode usar **subpasta** ou symlink; o importante é que o remote `origin` aponte para o repo do vault.

Copie ou adapte o [script opensync-vps-git-sync.sh](./scripts/opensync-vps-git-sync.sh) para o caminho real (ex.: copiar conteúdo de `~/.openclaw/workspace` para dentro do clone antes do commit, ou fazer o clone **dentro** de `~/.openclaw/workspace` se essa for a política da equipa).

## Cron OpenClaw (Gateway)

O OpenClaw agenda tarefas com `openclaw cron` (persistência em `~/.openclaw/cron/jobs.json`). Documentação oficial: [Scheduled Tasks (Cron)](https://docs.openclaw.ai/automation/cron-jobs).

Exemplo: execução isolada a cada 15 minutos, só ferramentas `exec` (e opcionalmente `read`), sem anunciar em canal:

```bash
openclaw cron add \
  --name "OpenSync vault push" \
  --every 15m \
  --session isolated \
  --message "Execute apenas: bash /root/bin/opensync-vps-git-sync.sh — reporte numa linha se ok ou o erro." \
  --tools exec \
  --delivery none
```

Recomendações:

- **`maxConcurrentRuns: 1`** na config `cron` do Gateway evita dois `git push` em simultâneo na mesma pasta.
- **`--delivery none`** para tarefas puramente operacionais; use `webhook` ou `announce` se quiserem alertas de falha.
- Ajustar `--every` ao volume de alterações.

## Plugin (opcional)

Para disparar sync sob demanda (sem esperar pelo cron), um [plugin OpenClaw](https://docs.openclaw.ai/tools/plugin) pode expor uma ferramenta que invoca o mesmo script. O cron continua a ser a base para periodicidade fiável.

## `.gitignore` e segredos

Nunca commitar tokens, chaves PEM, ou caches grandes. Manter um `.gitignore` no repositório (ou gerado no primeiro commit) com pelo menos:

- `.env`, `*.pem`, `**/credentials*`
- `node_modules`, `.cache`, `sandboxes/`, `browser-profile/`

## Resolução de conflitos

Se o dashboard também faz push para `main`, o script na VPS deve fazer **`git pull --rebase origin main`** antes do commit/push. Se o rebase falhar, o job deve falhar de forma visível (log/cron) para intervenção humana.

**Política OpenSync:** dois escritores no mesmo branch (`main`) — o explorador com sync manual e o cron na VPS — exigem o rebase no script; falhas de rebase são resolvidas manualmente no clone da VPS (ou temporariamente pausar um dos lados).

## Operações e segurança

- **Rotação:** no dashboard, página *Ligar Git na VPS* — revogar deploy key e gerar nova; atualizar ficheiro de chave e `GIT_SSH_COMMAND` na VPS.
- **Webhook:** opcional futuro — payload mínimo assinado; ver nota em [vault-git-api.md](./vault-git-api.md).
