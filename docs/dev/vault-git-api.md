# API: Git do vault (deploy key para o agente)

Estes endpoints permitem que a **VPS OpenClaw** use Git com credencial **restrita ao repositório do vault**, sem expor o token de administrador do Gitea.

## Autenticação (Nest)

Todos os pedidos exigem o header:

- `x-opensync-user-id`: UUID do utilizador (o Next envia o do Supabase).

## `POST /api/vaults/:id/git/deploy-key`

Cria um par de chaves **ed25519** (OpenSSH), regista a chave **pública** no Gitea como deploy key com **escrita**, e devolve a chave **privada uma única vez**.

**Resposta 201 (exemplo):**

```json
{
  "vaultId": "uuid",
  "giteaRepo": "opensync/nome-vault-abc12345",
  "giteaDeployKeyId": 42,
  "fingerprint": "SHA256:…",
  "publicKey": "ssh-ed25519 AAAA… opensync-vault-…",
  "privateKeyOpenssh": "-----BEGIN OPENSSH PRIVATE KEY-----\n…",
  "cloneSshUrl": "git@gitea.example.com:opensync/nome-vault-abc12345.git",
  "instructions": "…"
}
```

**Comportamento:**

- Se o vault já tiver `agentDeployKeyGiteaId` guardado, a key antiga é **removida** no Gitea antes de criar a nova.
- A **privada** não é armazenada no OpenSync; apenas `agentDeployKeyGiteaId` fica na tabela `vaults`.

**Erros comuns:**

- `404` — vault inexistente ou não pertence ao utilizador.
- `502` — Gitea indisponível ou erro na API de keys.
- `500` — `ssh-keygen` ausente no servidor API (imagem deve incluir `openssh-client`).

## `DELETE /api/vaults/:id/git/deploy-key`

Remove a deploy key do Gitea (id guardado em `agent_deploy_key_gitea_id`) e limpa o campo na base.

**Resposta 200 (exemplo):** `{ "ok": true, "removed": true }` — `removed: false` se não havia key registada.

## Variáveis de ambiente (API / Gitea)

| Variável | Uso |
|----------|-----|
| `GITEA_URL` | URL base HTTPS do Gitea (já usada). |
| `GITEA_ADMIN_TOKEN` | Token com permissão para criar keys no repo (já usada para repos). |
| `GITEA_SSH_HOST` | Opcional. Hostname para `cloneSshUrl` (ex.: `gitea.fly.dev`). Se omitido, usa o hostname derivado de `GITEA_URL`. |

## `GET /api/vaults/:id/git/tree`

Clone shallow read-only, `git ls-tree` em `HEAD`. Devolve metadados para o explorador web (lazy).

**Resposta 200 (exemplo):**

```json
{
  "commitHash": "abc123…",
  "entries": [{ "path": "README.md", "size": 120 }]
}
```

**Limites:** máximo **5000** ficheiros; repositórios maiores devolvem `400`.

**Rate limit (Nest):** ~**40** pedidos / minuto / IP+rota (Throttler).

## `GET /api/vaults/:id/git/blob?path=`

Conteúdo UTF-8 de um ficheiro em `HEAD` (clone shallow + `git show`).

**Limites:** **1 MiB** por ficheiro; ficheiros binários (bytes nulos) → `400`; acima do limite → `413`.

**Rate limit (Nest):** ~**60** pedidos / minuto / IP+rota.

O parâmetro de query `ref` em `tree` está reservado; com clone `--depth 1` apenas `HEAD` é fiável.

## Proxy Next.js

O browser chama rotas do App Router que reenviam para o Nest com a sessão Supabase:

- `POST /api/vaults/[id]/git/deploy-key`
- `DELETE /api/vaults/[id]/git/deploy-key`
- `GET /api/vaults/[id]/git/tree`
- `GET /api/vaults/[id]/git/blob?path=…`

Ver implementação em [`apps/web/src/app/api/vaults/`](../../apps/web/src/app/api/vaults/).

## Webhook opcional (futuro)

Para confirmar push na VPS sem expor conteúdo do repo, pode expor um endpoint que aceite apenas `{ vaultId, commit, ok }` com **HMAC** (segredo por vault). Ainda não implementado no produto; o cron pode usar `--delivery webhook` quando existir URL estável.

## Fluxo do utilizador (produto)

1. Criar / abrir vault no dashboard.
2. “Gerar chave para o agente” → receber `privateKeyOpenssh` e `cloneSshUrl` uma vez.
3. Na VPS: guardar privada, `git clone`, instalar script + cron (ver [openclaw-agent-sync.md](./openclaw-agent-sync.md)).
4. Continuar a editar no OpenSync; o `POST .../sync` existente continua a enviar alterações para o Gitea com o token do servidor.
