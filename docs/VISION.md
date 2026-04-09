# opensync.space — Vision & Architecture Document

> **Para uso com Claude Code.** Este documento é o contexto primário do projeto. Leia-o inteiro antes de escrever qualquer código.

---

## 1. O Produto

**opensync.space** é um vault sync inteligente para workspaces de agentes de IA, com foco inicial em OpenClaw (`./openclaw`). O produto permite que usuários façam backup automático, versionem com Git, e editem arquivos `.md` com links `[[wikilinks]]` via interface web — similar ao Obsidian, mas conectado a agentes de IA.

### Problema que resolve

O OpenClaw modifica arquivos de configuração do workspace (`./openclaw`) de forma autônoma, sem histórico de versões. Quando o agente quebra uma configuração, não há como reverter. O opensync.space resolve isso com versionamento Git automático, sync na nuvem, e uma interface web para visualizar, editar e restaurar versões.

### Proposta de valor

- Git-powered versioning automático (commit a cada mudança)
- Rollback com 1 clique via interface web
- Editor web com `[[wikilinks]]` e graph view
- Instalação via plugin/skill OpenClaw — zero configuração manual
- Mais barato que Obsidian Sync + Publish combinados ($5/mo vs $12/mo+)

---

## 2. Domínio e Identidade

| Campo | Valor |
|---|---|
| Domínio | opensync.space |
| Cor primária | `#1D9E75` (teal) |
| Cor secundária | `#5DCAA5` (teal claro) |
| Cor escura | `#0F6E56` |
| Font sans | Inter |
| Font mono | JetBrains Mono |
| Border radius | 0.5rem |

Tema Tailwind/shadcn em `opensync-theme.json`. CSS vars em `globals.css`.

---

## 3. Stack Técnica

### Frontend — Next.js 14+ (App Router)

```
apps/web/
├── app/
│   ├── (marketing)/        # landing page, pricing
│   ├── (auth)/             # login, signup, onboarding
│   ├── (app)/
│   │   ├── dashboard/      # lista de vaults
│   │   ├── vault/[id]/     # file tree + editor + graph
│   │   └── settings/       # conta, plano, billing
│   └── api/                # route handlers (webhooks, etc.)
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── vault/              # VaultTree, FileEditor, GraphView
│   ├── commits/            # CommitTimeline, DiffViewer, RollbackBtn
│   └── marketing/          # Hero, Pricing, FeatureGrid
└── lib/
    ├── api.ts              # cliente para NestJS API
    ├── supabase.ts         # cliente Supabase browser/server
    └── i18n/               # next-intl config (PT, EN, ES)
```

**Dependências principais:**
- `next` 14+, `react` 18+
- `@supabase/ssr` para auth e realtime
- `codemirror` 6 + `@codemirror/lang-markdown` para o editor
- `remark-wiki-link` para parser de `[[wikilinks]]`
- `d3` para o graph view (force simulation)
- `next-intl` para i18n
- `shadcn/ui` + `tailwindcss` para UI
- `@tanstack/react-query` para cache e fetching

### Backend — NestJS

```
apps/api/
├── src/
│   ├── auth/               # JWT, refresh, guards
│   ├── vaults/             # CRUD de vaults
│   ├── sync/               # push/pull Git, proxy para Gitea
│   ├── commits/            # histórico, diff, rollback
│   ├── graph/              # indexação de wikilinks
│   ├── plans/              # limites freemium, feature flags
│   ├── billing/            # Stripe webhooks
│   └── common/             # pipes, filters, interceptors
└── prisma/
    └── schema.prisma
```

**Dependências principais:**
- `@nestjs/core`, `@nestjs/jwt`, `@nestjs/swagger`
- `@supabase/supabase-js` para auth server-side
- `simple-git` para operações Git
- `stripe` para billing
- `prisma` ORM

### Banco de Dados — Supabase (PostgreSQL)

Schema detalhado na seção 6.

### Git Storage — Gitea (self-hosted)

Um repo por agente, criado automaticamente via Gitea API. O NestJS faz proxy de todas as operações Git — o usuário nunca interage diretamente com o Gitea.

### Plugin / Skill — OpenClaw

```
packages/plugin/
├── src/
│   index.ts                # entry point do plugin
│   watcher.ts              # chokidar file watcher
│   git.ts                  # operações Git locais
│   sync.ts                 # push para API
│   commands.ts             # /sync, /rollback, /status
└── skill/
    SKILL.md                # skill para o agente
```

---

## 4. Arquitetura de Sistema

```
┌─────────────────────────────────────────────────────┐
│                  Máquina do usuário                  │
│                                                      │
│  ┌──────────────┐    ┌────────────────────────────┐  │
│  │   OpenClaw   │───▶│  Plugin opensync           │  │
│  │  ./openclaw/ │    │  chokidar watcher          │  │
│  └──────────────┘    │  git commit + push HTTPS   │  │
│         ▲            └────────────┬───────────────┘  │
│         │                        │ git push           │
└─────────│────────────────────────│───────────────────┘
          │ rollback               │
          │                        ▼
┌─────────│────────────────────────────────────────────┐
│         │            NestJS API                       │
│         │                                             │
│  ┌──────┴──────┐  ┌────────────┐  ┌───────────────┐  │
│  │  Commits    │  │  Sync API  │  │  Plan Service │  │
│  │  + Rollback │  │  + Auth    │  │  + Billing    │  │
│  └─────────────┘  └─────┬──────┘  └───────────────┘  │
│                         │                             │
└─────────────────────────│───────────────────────────┘
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
   ┌────────────┐  ┌────────────┐  ┌────────────────┐
   │   Gitea    │  │  Supabase  │  │    Stripe      │
   │ self-hosted│  │ PostgreSQL │  │    Billing     │
   │ repo/agent │  │ + Realtime │  └────────────────┘
   └────────────┘  └─────┬──────┘
                         │ realtime
                         ▼
                  ┌────────────────┐
                  │  Next.js Web   │
                  │  Dashboard     │
                  │  Editor        │
                  │  Graph View    │
                  └────────────────┘
```

---

## 5. Fluxo Principal (Happy Path)

### Instalação do plugin

1. Usuário cria conta em opensync.space
2. Copia o token de API gerado na onboarding
3. No OpenClaw, instala o plugin: `/install opensync`
4. Plugin inicializa: `git init ./openclaw`, configura remote para API, faz primeiro push
5. Gitea cria repo `user-id/agent-name` automaticamente

### Sync automático

1. Agente modifica arquivo em `./openclaw`
2. **Skill** intercepta antes da modificação: `git commit -m "pre: before agent edit"`
3. Agente faz a modificação
4. **Plugin** detecta mudança via chokidar: `git add . && git commit -m "auto: <filename> updated"`
5. Plugin faz `git push https://api.opensync.space/git/user-id/agent-name`
6. API valida token, verifica limite do plano, faz proxy para Gitea
7. Supabase Realtime notifica o browser: novo commit disponível
8. Dashboard atualiza a timeline em tempo real

### Rollback

1. Usuário clica "restore" num commit no dashboard
2. Frontend chama `POST /api/vaults/:id/rollback { commitHash }`
3. NestJS faz `git revert` ou `git checkout <hash>` no Gitea
4. API faz push do estado revertido de volta para a máquina via webhook/SSE
5. Plugin recebe o push e aplica localmente

---

## 6. Schema do Banco (Supabase/PostgreSQL)

```sql
-- Usuários (espelha auth.users do Supabase)
create table public.profiles (
  id          uuid primary key references auth.users(id),
  email       text not null,
  plan        text not null default 'free', -- free | pro | team
  stripe_customer_id text,
  created_at  timestamptz default now()
);

-- Vaults (um por pasta/projeto)
create table public.vaults (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  description text,
  gitea_repo  text not null, -- ex: "user-abc/my-agent"
  path        text not null default './openclaw',
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- Agentes (um vault pode ter múltiplos agentes)
create table public.agents (
  id          uuid primary key default gen_random_uuid(),
  vault_id    uuid not null references vaults(id) on delete cascade,
  name        text not null,
  token_hash  text not null, -- hash do API token do plugin
  last_sync   timestamptz,
  created_at  timestamptz default now()
);

-- Commits (espelho dos commits do Gitea)
create table public.commits (
  id          uuid primary key default gen_random_uuid(),
  vault_id    uuid not null references vaults(id) on delete cascade,
  agent_id    uuid references agents(id),
  hash        text not null,
  message     text not null,
  files_changed int default 0,
  additions   int default 0,
  deletions   int default 0,
  created_at  timestamptz default now()
);

-- Links entre arquivos (para o graph view)
create table public.file_links (
  id          uuid primary key default gen_random_uuid(),
  vault_id    uuid not null references vaults(id) on delete cascade,
  source_file text not null,  -- ex: "AGENTS.md"
  target_file text not null,  -- ex: "CLAUDE.md"
  updated_at  timestamptz default now(),
  unique(vault_id, source_file, target_file)
);

-- Audit log
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id),
  vault_id    uuid references vaults(id),
  action      text not null, -- push | rollback | edit | delete
  metadata    jsonb,
  created_at  timestamptz default now()
);

-- RLS policies
alter table public.vaults enable row level security;
create policy "users own vaults"
  on public.vaults for all
  using (auth.uid() = user_id);

alter table public.commits enable row level security;
create policy "users see own commits"
  on public.commits for select
  using (vault_id in (select id from vaults where user_id = auth.uid()));
```

---

## 7. API Endpoints (NestJS)

### Auth
```
POST   /auth/signup
POST   /auth/login
POST   /auth/refresh
DELETE /auth/logout
```

### Vaults
```
GET    /vaults                    # listar vaults do usuário
POST   /vaults                    # criar vault
GET    /vaults/:id                # detalhes do vault
PATCH  /vaults/:id                # atualizar nome/descrição
DELETE /vaults/:id                # deletar vault
```

### Arquivos
```
GET    /vaults/:id/files          # listar arquivos (tree)
GET    /vaults/:id/files/*path    # conteúdo do arquivo
PUT    /vaults/:id/files/*path    # salvar arquivo (commit automático)
DELETE /vaults/:id/files/*path    # deletar arquivo
```

### Commits
```
GET    /vaults/:id/commits        # timeline de commits
GET    /vaults/:id/commits/:hash  # detalhes + diff
POST   /vaults/:id/rollback       # { commitHash: string }
```

### Graph
```
GET    /vaults/:id/graph          # nós e arestas para o D3
```

### Git (proxy para Gitea — usado pelo plugin)
```
POST   /git/:vaultId/push         # recebe push do plugin
GET    /git/:vaultId/pull         # plugin baixa estado atual
```

### Billing
```
GET    /billing/plans             # planos disponíveis
POST   /billing/checkout          # criar sessão Stripe
POST   /billing/portal            # portal do cliente Stripe
POST   /billing/webhook           # webhook Stripe (público)
```

---

## 8. Componentes Frontend Principais

### `<GraphView vault={vault} />`

D3 force simulation. Dados de `/vaults/:id/graph`.

```tsx
// Estrutura de dados esperada da API
type GraphData = {
  nodes: { id: string; label: string; size: number }[]
  edges: { source: string; target: string }[]
}
```

- Nó selecionado = arquivo aberto no editor
- Click em nó navega para o arquivo
- Supabase Realtime atualiza o grafo quando novo commit chega

### `<FileEditor vault={vault} path={path} />`

CodeMirror 6 com extensões:
- `@codemirror/lang-markdown`
- Plugin customizado para `[[wikilinks]]` (highlight + click to navigate)
- Auto-save com debounce de 1500ms → commit automático via API

### `<CommitTimeline vault={vault} />`

Lista de commits com diff inline. Cada item mostra:
- Hash curto, mensagem, tempo relativo
- Arquivos modificados
- Botão "restore" (só usuários pro+)

### `<VaultTree vault={vault} />`

Sidebar com árvore de arquivos. Agrupa por diretório. Indica arquivo ativo. Badge "modified" quando há changes não commitados.

---

## 9. Plugin OpenClaw

### Estrutura do plugin

```typescript
// packages/plugin/src/index.ts
export default {
  name: "opensync",
  version: "0.1.0",
  hooks: {
    onLoad: async (ctx) => {
      await initGit(ctx.workspaceDir)
      await startWatcher(ctx.workspaceDir, ctx.config.token)
    },
    onUnload: async () => {
      await stopWatcher()
    }
  },
  commands: {
    "/sync": cmdSync,
    "/sync status": cmdStatus,
    "/sync rollback": cmdRollback,
  }
}
```

### Skill do agente (SKILL.md)

```markdown
# opensync — auto-commit skill

Antes de modificar qualquer arquivo em ./openclaw, execute:
  git -C ./openclaw add . && git -C ./openclaw commit -m "pre: snapshot before edit"

Isso garante que o estado anterior esteja salvo e possa ser restaurado.
```

---

## 10. Modelo Freemium

| Feature | Free | Pro ($5/mo) | Team ($12/user/mo) |
|---|---|---|---|
| Vaults | 1 | Ilimitado | Ilimitado |
| Agentes por vault | 1 | Ilimitado | Ilimitado |
| Commits retidos | 50 | Ilimitado | Ilimitado |
| Rollback | — | ✓ | ✓ |
| Editor web | Somente leitura | ✓ | ✓ |
| Graph view | — | ✓ | ✓ |
| Sync multi-máquina | — | ✓ | ✓ |
| Vaults compartilhados | — | — | ✓ |
| Audit log | — | — | ✓ |
| SSO / SAML | — | — | ✓ |

**Lógica de limites:** Implementada no `PlanService` do NestJS. Cada endpoint de escrita verifica o plano antes de executar. Retorna `403 { code: "PLAN_LIMIT", feature: "..." }` para upgrade prompts no frontend.

---

## 11. Infraestrutura e Deploy

### Serviços

| Serviço | Provider | Notas |
|---|---|---|
| Frontend (Next.js) | Vercel | Deploy automático via GitHub |
| Backend (NestJS) | Railway ou Render | Docker container |
| Gitea | VPS próprio (DigitalOcean/Hetzner) | 4GB RAM mínimo |
| Banco | Supabase | Managed PostgreSQL |
| Storage | Supabase Storage | Para backups de vault |
| Pagamentos | Stripe | Webhooks apontam para NestJS |

### Variáveis de ambiente

```bash
# apps/web (.env.local)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=https://api.opensync.space/api
NEXT_PUBLIC_APP_URL=https://opensync.space

# apps/api (.env)
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GITEA_URL=https://git.opensync.space
GITEA_ADMIN_TOKEN=
JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

### Monorepo (Turborepo)

```
opensync/
├── apps/
│   ├── web/          # Next.js
│   └── api/          # NestJS
├── packages/
│   ├── plugin/       # Plugin OpenClaw
│   ├── ui/           # Componentes compartilhados
│   └── config/       # tsconfig, eslint base
├── turbo.json
└── package.json
```

---

## 12. Roadmap de Desenvolvimento

### Fase 1 — MVP (semanas 1–6)

- [ ] Setup monorepo (Turborepo + Next.js + NestJS)
- [ ] Auth com Supabase (email + GitHub OAuth)
- [ ] Schema PostgreSQL + RLS policies
- [ ] Gitea self-hosted + auto-criação de repos
- [ ] NestJS Sync API (push/pull proxy para Gitea)
- [ ] Plugin OpenClaw (watcher + git commit + push)
- [ ] Skill do agente (pre-commit hook)
- [ ] Dashboard: lista de vaults e agentes
- [ ] File tree com navegação
- [ ] Editor markdown básico (CodeMirror 6)
- [ ] Timeline de commits
- [ ] Landing page com pricing

### Fase 2 — Growth (semanas 7–12)

- [ ] `[[wikilinks]]` no editor (highlight + navegação)
- [ ] Graph view com D3 force simulation
- [ ] Indexação de links no backend (tabela `file_links`)
- [ ] Supabase Realtime (atualização em tempo real)
- [ ] Rollback 1 clique
- [ ] Stripe billing (Pro + Team)
- [ ] i18n completo (PT, EN, ES) com next-intl
- [ ] Plugin publicado no registry do OpenClaw

### Fase 3 — Team (semanas 13–20)

- [ ] Vaults compartilhados (permissões read/write)
- [ ] Audit log completo com export CSV
- [ ] SSO / SAML (Okta, Azure AD)
- [ ] API pública com OpenAPI spec + API keys
- [ ] Suporte a qualquer pasta (não só `./openclaw`)
- [ ] Mobile-responsive completo

---

## 13. Convenções de Código

### Nomenclatura

- Arquivos: `kebab-case` para tudo
- Componentes React: `PascalCase`
- Funções e variáveis: `camelCase`
- Constantes: `UPPER_SNAKE_CASE`
- Tabelas no banco: `snake_case`

### Commits

```
feat: adiciona graph view com D3
fix: corrige rollback quando arquivo deletado
chore: atualiza dependências
docs: adiciona JSDoc no PlanService
```

### Estrutura de resposta da API

```typescript
// Sucesso
{ data: T, meta?: { total: number, page: number } }

// Erro
{ error: { code: string, message: string, details?: unknown } }
```

### Tratamento de erros no NestJS

Usar filtros globais. Nunca retornar stack traces em produção. Logar erros com contexto suficiente para debug.

---

## 14. Segurança

- Tokens do plugin: gerados com `crypto.randomBytes(32)`, armazenados como hash bcrypt
- Git via HTTPS autenticado: token no header, nunca na URL
- RLS no Supabase: usuário só acessa seus próprios vaults
- Rate limiting no NestJS: `@nestjs/throttler`
- CORS configurado para `opensync.space` apenas em produção
- Gitea: isolado sem acesso público, só acessível pelo NestJS
- Stripe webhooks: validação de assinatura obrigatória

---

## 15. Referências

- OpenClaw plugin API: https://docs.openclaw.dev/plugins
- Gitea API: https://gitea.io/api/swagger
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- shadcn/ui: https://ui.shadcn.com
- CodeMirror 6: https://codemirror.net/docs
- D3 force simulation: https://d3js.org/d3-force
- next-intl: https://next-intl-docs.vercel.app
- simple-git: https://github.com/steveukx/git-js