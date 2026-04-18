# Documentação de desenvolvimento e infra

Índice focado no objetivo do produto: **manter ficheiros alinhados entre a VPS OpenClaw, o Gitea e a aplicação OpenSync**, com o utilizador a editar no dashboard e o agente a publicar alterações locais para o mesmo repositório.

## Sincronização e Git

| Documento | Conteúdo |
|-----------|----------|
| [sync-engine-v2.md](./sync-engine-v2.md) | **Nova arquitetura:** file-first, offline-first bidirecional, manifest diff, 3 niveis de delta, tombstones, fileId estavel, conflict copy + merge 3-way, API incremental por cursor, E2EE (futuro). |
| [sync-architecture.md](./sync-architecture.md) | Arquitetura legada: três bases (VPS / Gitea / web), fluxos e roadmap anterior. |
| [vault-git-api.md](./vault-git-api.md) | Deploy key, `GET .../git/tree` e `GET .../git/blob`, proxy Next, rate limit. |
| [templates/vault-gitignore](./templates/vault-gitignore) | Modelo `.gitignore` para o workspace na VPS. |
| [openclaw-agent-sync.md](./openclaw-agent-sync.md) | Clone na VPS, cron OpenClaw, plugin opcional, conflitos `pull --rebase`. |
| [opensync-openclaw-skill.md](./opensync-openclaw-skill.md) | Onde está a skill (`packages/plugin/skill/SKILL.md`), instalação no OpenClaw, cópia integral. |
| [scripts/opensync-vps-git-sync.sh](./scripts/opensync-vps-git-sync.sh) | Script bash: pull --rebase, commit, push. |

## Infra existente

| Documento | Conteúdo |
|-----------|----------|
| [gitea-ionos-first-install.md](./gitea-ionos-first-install.md) | Assistente inicial do Gitea na VPS, firewall, token, `GITEA_URL` em dev e Fly |
| [fly-ionos-ssh.md](./fly-ionos-ssh.md) | Chave SSH da produção Fly para a VPS IONOS |
| [gitea-supabase-postgres.md](./gitea-supabase-postgres.md) | Configuração do Gitea usando PostgreSQL do Supabase para escala |
| [supabase-rls-implementation.md](./supabase-rls-implementation.md) | RLS: `anon`/`authenticated`/`service_role`, tabelas OpenSync vs Gitea, onde está o SQL, checklist |

## Billing e assinaturas

| Documento | Conteúdo |
|-----------|----------|
| [billing-stripe-subscription-plan.md](./billing-stripe-subscription-plan.md) | Plano de implementação Stripe: tiers free/plus/pro/business/enterprise, preços, webhooks, Prisma, API, web, referência ao SuperSquad. |

## Implementação no código (referência rápida)

| Área | Onde |
|------|------|
| Push texto browser → Gitea | [VaultGitSyncService](../../apps/api/src/sync/vault-git-sync.service.ts), `POST /api/vaults/:id/sync` |
| Leitura lazy explorador | `GET /api/vaults/:id/git/tree`, `GET /api/vaults/:id/git/blob` (mesmo serviço + throttling) |
| Deploy key agente | [VaultsController](../../apps/api/src/vaults/vaults.controller.ts) `POST|DELETE .../git/deploy-key`, [GiteaService](../../apps/api/src/sync/gitea.service.ts) |
| Geração `ssh-keygen` | [openssh-keygen.util.ts](../../apps/api/src/sync/openssh-keygen.util.ts); imagem API: `openssh-client` no [Dockerfile](../../apps/api/Dockerfile) |
| Proxy Next autenticado | [git/deploy-key](../../apps/web/src/app/api/vaults/[id]/git/deploy-key/route.ts), [git/tree](../../apps/web/src/app/api/vaults/[id]/git/tree/route.ts), [git/blob](../../apps/web/src/app/api/vaults/[id]/git/blob/route.ts) |
| Coluna Prisma | `vaults.agent_deploy_key_gitea_id` |

## Migração de base

Após atualizar o código da API:

```bash
cd apps/api && npx prisma migrate deploy
```

(ou `prisma migrate dev` em desenvolvimento.)

No **Fly** (`opensync-api`), o [`fly.toml`](../../apps/api/fly.toml) define `release_command = "npx prisma migrate deploy"`. O datasource Prisma usa **`DATABASE_URL`** (pode ser o pooler Supabase **:6543**) e **`DIRECT_URL`** (conexão **direta :5432**). Sem `DIRECT_URL`, o `migrate deploy` contra o pooler costuma falhar com `prepared statement "s1" already exists`. Define na Fly:

`fly secrets set DIRECT_URL='postgresql://...:5432/postgres' -a opensync-api`

(alinha com o mesmo host/user/password do direct no Supabase; não uses o pooler na `DIRECT_URL`.)

Se aparecer erro **P2022** (coluna inexistente), a migração ainda não correu na base: faz deploy após `migrate deploy` passar ou corre o comando localmente com as duas URLs.
