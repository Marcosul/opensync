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

1. **Credenciais**: no OpenSync, gere uma **API key** (Vault → *Git na VPS* → secção *API do agente*, ou assistente de novo vault OpenClaw). Guarde `OPENSYNC_VAULT_ID` e use a URL base da API **com sufixo `/api`** em `OPENSYNC_API_URL` (ex.: `https://api.opensync.space/api`).
2. **Pedido HTTP**: `Authorization: Bearer <api-key>`. Exemplo de endpoint: `POST ${OPENSYNC_API_URL}/git/${OPENSYNC_VAULT_ID}/push` (corpo JSON conforme o plugin).
3. **Plugin**: com `OPENSYNC_API_URL`, `OPENSYNC_VAULT_ID` e token no contexto, o comando `/sync` faz commit local e chama a API.

## Instalação da skill (OpenClaw)

O OpenClaw segue pastas de skills compatíveis com [AgentSkills](https://agentskills.io); ver [Skills no OpenClaw](https://docs.openclaw.ai/tools/skills) para precedência completa.

**Onde colocar** (por ordem de precedência típica, do mais específico ao partilhado):

- `<workspace>/skills/opensync/SKILL.md` — só nesse workspace do agente
- `<workspace>/.agents/skills/opensync/SKILL.md`
- `~/.agents/skills/opensync/SKILL.md` — skills pessoais em todas as workspaces da máquina
- `~/.openclaw/skills/opensync/SKILL.md` — skills geridas/local, visíveis a todos os agentes na máquina

Copie o ficheiro deste repositório `packages/plugin/skill/SKILL.md` para `.../opensync/SKILL.md` numa das pastas acima (crie a pasta `opensync`).

### Depois de instalar ou alterar `SKILL.md`

- Por defeito o OpenClaw **observa** as pastas de skills; muitas alterações passam a contar na **próxima jogada** do agente (hot reload do snapshot de skills).
- O snapshot de skills é criado **no início da sessão**; mudanças profundas ou config em `openclaw.json` (`skills.entries`, etc.) podem exigir **uma nova sessão** de chat/agente para ficarem visíveis.
- **Não é obrigatório** reiniciar o Gateway só por ter copiado esta skill; reiniciar o processo do Gateway só se alterou configuração do próprio Gateway ou se o ambiente não estiver a aplicar mudanças (caso raro).

## Alternativa — Git na VPS (deploy key)

1. No dashboard: *Ligar Git na VPS* → gerar **deploy key**, configurar `GIT_SSH_COMMAND` com `ssh -i … -o IdentitiesOnly=yes`.
2. Script: `docs/dev/scripts/opensync-vps-git-sync.sh` com `OPENSYNC_REPO_DIR` = pasta do clone.
3. **Scheduled Tasks** do OpenClaw para correr o script em horários fixos (ex.: 06:00 e 18:00); ver [Cron jobs](https://docs.openclaw.ai/automation/cron-jobs).

## Conflitos

Se `git pull --rebase` falhar, **não** forçar push; reportar ao utilizador.

## Documentação no repositório

- `docs/dev/openclaw-agent-sync.md` — fluxo Git na VPS
- `docs/dev/vault-git-api.md` — deploy keys na API
