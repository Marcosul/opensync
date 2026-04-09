---
name: opensync
description: Integração OpenSync — API HTTP, skill e sincronização do vault com Gitea.
---

# OpenSync — workspace e sincronização

## Contexto

O utilizador usa **OpenSync** (opensync.space) com um **vault** por repositório **Gitea**. O fluxo **preferido** é **só API**: **API key (Bearer)** + `POST ${OPENSYNC_API_URL}/git/<vaultId>/push` com JSON `{ "files": { … } }` — **sem `git init`**, sem Git no agente e sem plugin obrigatório. O token obtém-se no dashboard ou no assistente «Conectar agente OpenClaw».

## Sincronização via API (fluxo principal — só push)

1. **Credenciais**: no OpenSync, gere uma **API key** (Vault → *Agente e Git* → secção *API do agente*, ou assistente de novo vault OpenClaw). Defina no ambiente do agente (produção OpenSync):

```bash
export OPENSYNC_API_URL="https://api.opensync.space/api"
export OPENSYNC_VAULT_ID="<uuid-do-vault>"
export OPENSYNC_AGENT_API_KEY="<api-key>"
```

**Verificar se as variáveis estão ativas** na sessão de shell onde corre o agente ou onde vai testar o `curl` (não mostram nada se não estiverem definidas):

```bash
env | grep '^OPENSYNC_'
# ou, uma a uma:
echo "$OPENSYNC_API_URL"
echo "$OPENSYNC_VAULT_ID"
test -n "$OPENSYNC_AGENT_API_KEY" && echo "OPENSYNC_AGENT_API_KEY=definida" || echo "OPENSYNC_AGENT_API_KEY=vazia"
```

Os `export` acima **não ficam guardados** após fechar o terminal — só valem para essa sessão. Para persistir: ficheiro `~/.bashrc` / `~/.profile` (ou equivalente), ou `skills.entries.opensync.env` em `~/.openclaw/openclaw.json` conforme a [documentação de skills do OpenClaw](https://docs.openclaw.ai/tools/skills).

Em **self-hosted**, substitua `OPENSYNC_API_URL` pela URL da vossa API Nest **com sufixo `/api`** (ex.: `https://seu-dominio.com/api`).

2. **Pedido HTTP**: `Authorization: Bearer <api-key>`. O endpoint `POST ${OPENSYNC_API_URL}/git/${OPENSYNC_VAULT_ID}/push` **exige** um JSON com o mapa **`files`**: caminhos relativos → conteúdo UTF-8. A API faz commit no repositório Gitea desse vault com esse snapshot (ficheiros em `files` substituem o conteúdo rastreado no remoto; omitir um ficheiro que existia no Git remove-o no próximo sync completo).

Exemplo mínimo com `curl`:

```bash
curl -sS -X POST "${OPENSYNC_API_URL}/git/${OPENSYNC_VAULT_ID}/push" \
  -H "Authorization: Bearer ${OPENSYNC_AGENT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"files":{"notas/exemplo.md":"# Titulo\n\nTexto."}}'
```

Um corpo `{}` ou sem `files` **não** sincroniza — a API responde erro explicando o formato.

O trabalho Git (clone, commit, push para o Gitea) corre **no servidor OpenSync**. No agente basta **credenciais + HTTP** com o mapa `files`.

3. **Opcional — plugin `/sync`:** o pacote `packages/plugin` expõe o comando `/sync`, que faz `git add`/`commit` **local** e depois chama a mesma API com os ficheiros do disco. Só usem se quiserem histórico Git na pasta do workspace; o plugin pode correr `git init` no `onLoad`. **Não é o fluxo recomendado** se preferem evitar Git local.

## Opcional — snapshot local com Git

Se mantiverem um clone ou workspace com Git por outras razões, podem gravar um snapshot antes de edições grandes:

```bash
git -C ~/.openclaw/workspace add -A && git -C ~/.openclaw/workspace commit -m "pre: snapshot before agent edit" || true
```

(Ajuste o caminho. Isto **não** substitui o `push` para o OpenSync/Gitea.)

## Tarefa agendada: sync a cada 30 minutos (OpenClaw)

**Etapa obrigatória** após credenciais e skill instalada: criar no Gateway OpenClaw uma **Scheduled Task** (cron integrado) para sincronizar o vault **de 30 em 30 minutos**. Documentação: [Scheduled Tasks (Cron)](https://docs.openclaw.ai/automation/cron-jobs).

- O cron corre **dentro do Gateway**; jobs persistem em `~/.openclaw/cron/jobs.json`.
- Use `--session isolated` para uma jogada dedicada; ajuste `--tz` ao fuso do utilizador.
- A `--message` deve priorizar **`POST .../push`** com JSON `{ "files": { … } }` e `Authorization: Bearer` (`OPENSYNC_*` no ambiente). **Não** depende de `git init` local. O plugin `/sync` é alternativa secundária (Git no disco). Um `curl` só com `-d '{}'` **não** grava no Gitea.

Exemplo (intervalo fixo de 30 minutos, sem anúncio em canal — personalize a mensagem e ferramentas):

```bash
openclaw cron add \
  --name "OpenSync vault sync (30m)" \
  --every 30m \
  --session isolated \
  --message "OpenSync: POST .../git/<vaultId>/push com JSON {files: path->conteudo UTF-8} e Bearer OPENSYNC_AGENT_API_KEY (sem git local). Opcional: plugin /sync. Uma linha ok ou erro." \
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
  --message "OpenSync: POST push com JSON files + Bearer OPENSYNC_* (preferido). Alternativa: /sync. Uma linha ok ou erro." \
  --tools exec \
  --delivery none
```

Verificar jobs: `openclaw cron list`.

Se o CLI devolver **`pairing required`** ao falar com o Gateway (`ws://127.0.0.1:18789`), complete o **pairing** do cliente com o Gateway (UI OpenClaw / `openclaw` conforme a vossa instalação) e volte a executar `openclaw cron add`. O cron só é registado quando o Gateway aceita o pedido.

## Instalação da skill

Use o guia em **opensync.space** (`/docs/agent/opensync-skill`) ou o ficheiro `SKILL.md` fornecido pelo utilizador.

**Caminho de instalação** (crie a pasta `opensync` se não existir):

- `~/.openclaw/skills/opensync/SKILL.md`

Guarde o conteúdo completo deste documento nesse ficheiro.

### Primeiro push e repositório remoto

- **Gitea:** o repositório do vault é **criado pelo OpenSync** ao criar o cofre. **Não** criar o projeto à mão no Gitea.
- **Agente (fluxo preferido):** primeiro e seguintes envios = **`POST .../push`** com `{ "files": { … } }`. **Sem** `git init`, **sem** `git remote`, **sem** Git no cliente.
- **Só se usarem `/sync`:** aí o plugin pode inicializar Git local no `onLoad`; caso contrário **ignore** Git no disco.

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
