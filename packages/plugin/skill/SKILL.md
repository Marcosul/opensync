---

## name: opensync
description: Integração OpenSync — Git, commits e sincronização com o vault no Gitea.

# OpenSync — workspace e sincronização

## Contexto

O utilizador usa **OpenSync** (opensync.space) com um **vault** por repositório Gitea. O agente na VPS deve manter o workspace alinhado com esse remoto (pull antes de push quando houver dois escritores).

## Antes de editar ficheiros importantes

Garantir histórico local recuperável:

```bash
git -C ~/.openclaw/workspace add -A && git -C ~/.openclaw/workspace commit -m "pre: snapshot before agent edit" || true
```

(Ajuste o caminho se o clone do vault não for `~/.openclaw/workspace`.)

## Sincronização programática (recomendado)

1. **Remoto**: o utilizador gera **deploy key** no dashboard OpenSync (*Ligar Git na VPS*) e configura `GIT_SSH_COMMAND` com `ssh -i … -o IdentitiesOnly=yes`.
2. **Script**: usar o script versionado `docs/dev/scripts/opensync-vps-git-sync.sh` (variável `OPENSYNC_REPO_DIR` = pasta do clone).
3. **Imediato**: quando o utilizador pedir para publicar alterações, executar esse script com a ferramenta **exec** (ou `git pull --rebase`, `git add`, `git commit` se não houver mudanças pendentes, `git push`).
4. **Periódico**: ver secção *Scheduled Tasks* abaixo (duas vezes por dia: 06:00 e 18:00).

## Scheduled Tasks (OpenClaw Cron)

Use as [Scheduled Tasks (Cron) do OpenClaw](https://docs.openclaw.ai/automation/cron-jobs) para correr o script de sync em horários fixos. Ajuste o caminho do script, o fuso (`--tz`) e a mensagem ao ambiente do utilizador.

Crie **dois jobs** (um às 06:00 e outro às 18:00 no fuso escolhido):

```bash
# Sync OpenSync — manhã (06:00)
openclaw cron add \
  --name "OpenSync vault sync (06:00)" \
  --cron "0 6 * * *" \
  --tz "Europe/Lisbon" \
  --session isolated \
  --message "Execute apenas: bash /root/bin/opensync-vps-git-sync.sh — reporte numa linha se ok ou o erro." \
  --tools exec \
  --delivery none

# Sync OpenSync — fim do dia (18:00)
openclaw cron add \
  --name "OpenSync vault sync (18:00)" \
  --cron "0 18 * * *" \
  --tz "Europe/Lisbon" \
  --session isolated \
  --message "Execute apenas: bash /root/bin/opensync-vps-git-sync.sh — reporte numa linha se ok ou o erro." \
  --tools exec \
  --delivery none
```

- **Cron (5 campos)**: `0 6 * * *` = minuto 0, hora 6, todos os dias; `0 18 * * *` = às 18:00.
- `**--tz`**: obrigatório para horário de relógio local; troque `Europe/Lisbon` pelo timezone IANA do utilizador (ex.: `America/Sao_Paulo`).
- `**--message**`: deve apontar para o script real (ex. copiado de `docs/dev/scripts/opensync-vps-git-sync.sh`). O ambiente da VPS já deve ter `GIT_SSH_COMMAND` e `OPENSYNC_REPO_DIR` definidos onde o cron corre.
- `**openclaw cron list**` para verificar; `**openclaw cron remove <jobId>**` para remover.

Documentação complementar no repositório OpenSync: `docs/dev/openclaw-agent-sync.md`.

## Conflitos

Se `git pull --rebase` falhar, **não** forçar push; reportar ao utilizador e pedir resolução manual no clone.

## Plugin (avançado)

No monorepo OpenSync existe `packages/plugin` com comandos tipo `/sync` quando o Gateway expõe o plugin e variáveis `OPENSYNC_API_URL`, token e `OPENSYNC_VAULT_ID` estão definidos — uso típico é self-hosted.