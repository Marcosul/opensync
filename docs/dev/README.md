# Documentação de desenvolvimento e infra

Índice focado no objetivo do produto: **manter ficheiros alinhados entre a VPS OpenClaw, o Gitea e a aplicação OpenSync**, com o utilizador a editar no dashboard e o agente a publicar alterações locais para o mesmo repositório.

## Sincronização e Git

| Documento | Conteúdo |
|-----------|----------|
| [sync-architecture.md](./sync-architecture.md) | Três bases (VPS / Gitea / web), fluxos atuais e roadmap (tree/blob, SFTP legado). |
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
