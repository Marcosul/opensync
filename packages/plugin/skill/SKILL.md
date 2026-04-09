---
name: opensync
description: Integração OpenSync — API HTTP, skill e sincronização do vault com Gitea.
---

# OpenSync — workspace e sincronização

## Contexto

O utilizador usa **OpenSync** (opensync.space) com um **vault** por repositório **Gitea**. O caminho recomendado é **API key (Bearer)** + endpoints HTTP da API OpenSync; o plugin em `packages/plugin` chama `POST /api/git/<vaultId>/push` com o token emitido no dashboard ou no assistente «Conectar agente OpenClaw».

## Antes de editar ficheiros importantes

Garantir histórico local recuperável no workspace do agente:

```bash
git -C ~/.openclaw/workspace add -A && git -C ~/.openclaw/workspace commit -m "pre: snapshot before agent edit" || true
```

(Ajuste o caminho se o workspace não for `~/.openclaw/workspace`.)

## Sincronização via API (recomendado)

1. **Credenciais**: no OpenSync, gere uma **API key** (Vault → *Agente e Git* → secção *API do agente*, ou assistente de novo vault OpenClaw). Defina no ambiente do agente (produção OpenSync):

```bash
export OPENSYNC_API_URL="https://api.opensync.space/api"
export OPENSYNC_VAULT_ID="<uuid-do-vault>"
export OPENSYNC_AGENT_API_KEY="<api-key>"
```

Em **self-hosted**, substitua `OPENSYNC_API_URL` pela URL da vossa API Nest **com sufixo `/api`** (ex.: `https://seu-dominio.com/api`).

2. **Pedido HTTP**: `Authorization: Bearer <api-key>`. Exemplo de endpoint: `POST ${OPENSYNC_API_URL}/git/${OPENSYNC_VAULT_ID}/push` (corpo JSON conforme o plugin).
3. **Plugin**: com `OPENSYNC_API_URL`, `OPENSYNC_VAULT_ID` e token no contexto, o comando `/sync` faz commit local e chama a API.

## Tarefa agendada: sync a cada 30 minutos (OpenClaw)

**Etapa obrigatória** após credenciais e skill instalada: criar no Gateway OpenClaw uma **Scheduled Task** (cron integrado) para sincronizar o vault **de 30 em 30 minutos**. Documentação: [Scheduled Tasks (Cron)](https://docs.openclaw.ai/automation/cron-jobs).

- O cron corre **dentro do Gateway**; jobs persistem em `~/.openclaw/cron/jobs.json`.
- Use `--session isolated` para uma jogada dedicada; ajuste `--tz` ao fuso do utilizador.
- A `--message` deve instruir o agente a fazer commit (se aplicável) e chamar `POST ${OPENSYNC_API_URL}/git/${OPENSYNC_VAULT_ID}/push` com `Authorization: Bearer` igual a `OPENSYNC_AGENT_API_KEY` (ou usar o plugin `/sync` se estiver disponível).

Exemplo (intervalo fixo de 30 minutos, sem anúncio em canal — personalize a mensagem e ferramentas):

```bash
openclaw cron add \
  --name "OpenSync vault sync (30m)" \
  --every 30m \
  --session isolated \
  --message "Sincronizar vault OpenSync: commit local se houver alterações; depois POST à API OpenSync /git/<vaultId>/push com env OPENSYNC_API_URL, OPENSYNC_VAULT_ID e Bearer OPENSYNC_AGENT_API_KEY. Responder numa linha: ok ou erro." \
  --tools exec \
  --delivery none
```

Equivalente com expressão cron (5 campos) e fuso explícito:

```bash
openclaw cron add \
  --name "OpenSync vault sync (30m)" \
  --cron "*/30 * * * *" \
  --tz "Europe/Lisbon" \
  --session isolated \
  --message "Sincronizar vault OpenSync (API HTTP + Bearer). Uma linha: ok ou erro." \
  --tools exec \
  --delivery none
```

Verificar jobs: `openclaw cron list`.

## Instalação da skill

Use o guia em **opensync.space** (`/docs/agent/opensync-skill`) ou o ficheiro `SKILL.md` fornecido pelo utilizador.

**Caminho de instalação** (crie a pasta `opensync` se não existir):

- `~/.openclaw/skills/opensync/SKILL.md`

Guarde o conteúdo completo deste documento nesse ficheiro.

### Allowlist de skills (multi-agent)

Se no `openclaw.json` usarem **listas explícitas** de skills por agente (`agents.defaults.skills` ou `agents.list[].skills`), o OpenClaw **só** inclui no prompt as skills cujo **nome** está nessa lista. O nome desta skill é **`opensync`** (igual ao campo `name` no frontmatter).

- Sem `agents.defaults.skills` e sem `agents.list[].skills` por agente, as skills elegíveis costumam ser **todas** (salvo outras restrições).
- Um `agents.list[].skills` **não vazio** é o conjunto **final** desse agente (não faz merge com os defaults).
- Incluam **`opensync`** na allowlist do agente que deve sincronizar o vault, senão a skill pode não aparecer ou não ser invocável.

Documentação: [Agent skill allowlists](https://docs.openclaw.ai/tools/skills#agent-skill-allowlists).

### Depois de instalar ou alterar `SKILL.md`

- Muitos ambientes **observam** pastas de skills; alterações podem refletir-se na **próxima jogada** do agente.
- O conjunto de skills costuma fixar-se **no início da sessão** — se a skill não aparecer, abra uma **nova sessão** de chat.
- Só reinicie o serviço do agente/Gateway se o vosso ambiente exigir após mudanças de configuração global.

## Alternativa — Git na VPS (deploy key)

1. No dashboard: *Ligar Git na VPS* → gerar **deploy key**, configurar `GIT_SSH_COMMAND` com `ssh -i … -o IdentitiesOnly=yes`.
2. Script: `docs/dev/scripts/opensync-vps-git-sync.sh` com `OPENSYNC_REPO_DIR` = pasta do clone.
3. **Tarefas agendadas** do vosso agente (cron ou equivalente) para correr o script em horários fixos (ex.: 06:00 e 18:00).

## Conflitos

Se `git pull --rebase` falhar, **não** forçar push; reportar ao utilizador.

## Documentação no repositório

- `docs/dev/openclaw-agent-sync.md` — fluxo Git na VPS
- `docs/dev/vault-git-api.md` — deploy keys na API
