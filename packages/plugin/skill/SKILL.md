---
name: opensync
description: OpenSync — opensync-ubuntu (.deb), tokens pedidos ao utilizador, e snapshot HTTP opcional.
---

# OpenSync — workspace e sincronização

## Para o assistente (regras)

- **Não cries nem obtenhas tokens no OpenSync.** O dashboard exige sessão humana. O **utilizador** deve:
  - Gerar **token de workspace** (`usk_...`) em **Configurações → Tokens de acesso** (opensync.space).
  - Se precisares de **snapshot HTTP** (`POST .../files/snapshot`) sem o app Ubuntu, o utilizador gera uma **API key de agente** (`osk_...`) no fluxo de credenciais do vault no dashboard OpenSync (conforme a UI atual do produto).
- **Quando o `opensync init` pedir o token**, ou antes de guiar a instalação, **pede explicitamente** ao utilizador o `usk_...` que ele copiou do dashboard. Não assumes que já existe no ambiente até ele colar ou confirmar.
- Para pasta local em **Linux/Ubuntu**, o fluxo recomendado é **`opensync-ubuntu`** (pacote `.deb` + wizard), não `git init` no cliente para substituir a API.

## Ubuntu — instalação com o pacote `.deb` (recomendado)

1. O site OpenSync serve um instalador em **`GET /install/ubuntu`** (URL típica: `https://opensync.space/install/ubuntu`). O utilizador corre **uma linha** no terminal, por exemplo:
   - `curl -fsSL "https://opensync.space/install/ubuntu" | bash`
   - Em self-hosted, substitui o host pelo domínio da app (mesmo caminho `/install/ubuntu`).
2. O script descarrega o `.deb`, instala com `dpkg`/`apt` e corre **`opensync init`**. O wizard é **interativo** (e-mail, **`usk_...`**, pasta local, vault). O **utilizador** cola o `usk_...` quando o terminal pedir — **tu não o podes gerar**.
3. Depois do init, o serviço **systemd --user** (`opensync-ubuntu`) mantém o sync. Comandos úteis: `opensync status`, `journalctl --user -u opensync-ubuntu -f`.

Documentação humana: página **Agente Ubuntu** em opensync.space (`/docs/agent/ubuntu`).

## Contexto do produto

O utilizador usa **OpenSync** com um **vault** na **API** (Postgres como fonte de verdade; Gitea é espelho assíncrono). O fluxo **recomendado em Ubuntu** é **`opensync-ubuntu`**. Para **OpenClaw** sem pasta local, pode usar-se **API key (Bearer)** + `POST ${OPENSYNC_API_URL}/agent/vaults/<vaultId>/files/snapshot` com JSON `{ "files": { … } }` — **sem `git init`** no cliente para “substituir” o vault.

## Sincronização via API (OpenClaw / curl — snapshot)

1. **Credenciais** (definidas pelo **utilizador** no ambiente onde corre o agente ou o `curl`):

```bash
export OPENSYNC_API_URL="https://api.opensync.space/api"
export OPENSYNC_VAULT_ID="<uuid-do-vault>"
export OPENSYNC_AGENT_API_KEY="<api-key-osk_...>"
```

A **API key** (`osk_...`) **não** é criada pelo assistente: o utilizador gera-a no dashboard. Se o chat trouxer `OPENSYNC_AGENT_API_KEY` já preenchida, usa-a; senão, **pede** ao utilizador que gere e cole.

**Verificar variáveis** na sessão de shell:

```bash
env | grep '^OPENSYNC_'
echo "$OPENSYNC_API_URL"
echo "$OPENSYNC_VAULT_ID"
test -n "$OPENSYNC_AGENT_API_KEY" && echo "OPENSYNC_AGENT_API_KEY=definida" || echo "OPENSYNC_AGENT_API_KEY=vazia"
```

Os `export` **não persistem** após fechar o terminal. Para persistir: `~/.bashrc` / `~/.profile`, ou `skills.entries.opensync.env` em `~/.openclaw/openclaw.json` conforme a [documentação de skills do OpenClaw](https://docs.openclaw.ai/tools/skills).

Em **self-hosted**, `OPENSYNC_API_URL` = URL da API Nest **com sufixo `/api`**.

2. **Pedido HTTP**: `Authorization: Bearer <api-key>`. `POST ${OPENSYNC_API_URL}/agent/vaults/${OPENSYNC_VAULT_ID}/files/snapshot` **exige** JSON com o mapa **`files`**: caminhos relativos → conteúdo UTF-8.

Exemplo mínimo:

```bash
curl -sS -X POST "${OPENSYNC_API_URL}/agent/vaults/${OPENSYNC_VAULT_ID}/files/snapshot" \
  -H "Authorization: Bearer ${OPENSYNC_AGENT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"files":{"notas/exemplo.md":"# Titulo\n\nTexto."}}'
```

Corpo `{}` ou sem `files` → erro da API.

3. **Opcional — plugin `/sync`:** o pacote `packages/plugin` pode expor `/sync` com `git` local + chamada à mesma API. **Não é o fluxo recomendado** se o objetivo é evitar Git local; prefere **opensync-ubuntu** em Ubuntu.

## Opcional — snapshot local com Git

Se mantiverem Git local por outras razões:

```bash
git -C ~/.openclaw/workspace add -A && git -C ~/.openclaw/workspace commit -m "pre: snapshot before agent edit" || true
```

(Ajuste o caminho. **Não** substitui o push/snapshot para OpenSync.)

## Tarefa agendada: sync a cada 30 minutos (OpenClaw)

Após credenciais e skill: criar **Scheduled Task** no Gateway (cron integrado). [Scheduled Tasks (Cron)](https://docs.openclaw.ai/automation/cron-jobs).

- Jobs em `~/.openclaw/cron/jobs.json`.
- `--session isolated`; ajustar `--tz`.
- A `--message` deve priorizar **`POST .../files/snapshot`** com `{ "files": … }` e Bearer. **Não** depende de `git init` local.

Exemplo:

```bash
openclaw cron add \
  --name "OpenSync vault sync (30m)" \
  --every 30m \
  --session isolated \
  --message "OpenSync: POST .../agent/vaults/<vaultId>/files/snapshot com JSON {files} e Bearer OPENSYNC_AGENT_API_KEY." \
  --tools exec \
  --delivery none
```

Se aparecer **`pairing required`**, completar pairing com o Gateway antes de `openclaw cron add`.

## Instalação da skill

Guia: **opensync.space** → `/docs/agent/opensync-skill`, ou o `SKILL.md` fornecido pelo utilizador.

**Caminho:**

- `~/.openclaw/skills/opensync/SKILL.md`

### Primeiro snapshot e repositório remoto

- **Gitea:** repositório do vault é criado pelo OpenSync; espelho atualizado no servidor.
- **OpenClaw (HTTP):** `POST .../files/snapshot` com `{ "files": … }`.
- **Ubuntu:** **`opensync-ubuntu`** (`.deb` + init + systemd).

### Allowlist de skills (multi-agent)

Nome da skill: **`opensync`** (frontmatter). Incluir em `agents.defaults.skills` ou `agents.list[].skills` conforme [Agent skill allowlists](https://docs.openclaw.ai/tools/skills#agent-skill-allowlists).

### Depois de instalar ou alterar `SKILL.md`

- Nova sessão de chat se a skill não aparecer.
- Reiniciar Gateway só se o ambiente exigir.

## Avançado — Git na VPS (deploy key)

Fluxo opcional para `git push` por SSH: deploy key + script (ver documentação de desenvolvimento do repositório OpenSync, ex.: `docs/dev/`). **Não confundir** com o fluxo principal `.deb` + API.

## Conflitos

Se `git pull --rebase` falhar, **não** forçar push; reportar ao utilizador.

## Documentação no repositório

- `docs/dev/openclaw-agent-sync.md`
- `docs/dev/vault-git-api.md`
