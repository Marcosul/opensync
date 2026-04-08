# Implementação de Row Level Security (RLS) no Supabase — OpenSync + Gitea

Este documento descreve **como** o projeto usa RLS no PostgreSQL do Supabase: papéis (`anon`, `authenticated`, `service_role`), tabelas da aplicação OpenSync frente às tabelas do Gitea no mesmo `public`, e onde o SQL vive no repositório.

## 1. Porque RLS importa

No Supabase, a **Data API** (PostgREST) expõe o schema `public` aos clientes que usam:

| Papel | Uso típico |
|--------|------------|
| **`anon`** | Pedidos sem sessão (chave `anon` no browser). |
| **`authenticated`** | Utilizador com JWT do Supabase Auth (`auth.uid()` disponível nas políticas). |
| **`service_role`** | Só no **servidor** — ignora RLS; não expor no browser. |

Se uma tabela em `public` tiver **RLS desligado** e existirem `GRANT` que permitam leitura/escrita a `anon`/`authenticated`, a API pode expor dados em excesso. Por isso o dashboard marca **UNRESTRICTED** quando RLS está off.

**Objetivo desta implementação:**

- Tabelas **OpenSync**: RLS **ligado** + **políticas** que amarram linhas ao `auth.uid()` (ou a vaults/workspaces do utilizador).
- Tabelas **Gitea** (metadados do servidor Git na mesma base): RLS **ligado** + **sem políticas** para `anon`/`authenticated` → acesso via PostgREST **negado**; o Gitea continua a funcionar porque liga com o **user Postgres** que é **dono** das tabelas (o dono **não é sujeito a RLS** em PostgreSQL, salvo `FORCE ROW LEVEL SECURITY`).

## 2. Onde está definido no código

### 2.1 Migração Prisma (fonte de verdade para a app)

Ficheiro: [`apps/api/prisma/migrations/20260409140000_init_schema/migration.sql`](../../apps/api/prisma/migrations/20260409140000_init_schema/migration.sql)

Inclui:

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` em:
  - `profiles`, `workspaces`, `vaults`, `agents`, `commits`, `file_links`, `audit_log`
- `ALTER TABLE _prisma_migrations ENABLE ROW LEVEL SECURITY` **sem políticas** para `anon`/`authenticated` (bloqueio via API; Prisma usa ligação direta com user da connection string).
- `CREATE POLICY ...` com `auth.uid()` e subconsultas a `workspaces` / `vaults` conforme o modelo de dados.

Resumo das regras de negócio:

| Tabela | Ideia da política |
|--------|-------------------|
| `profiles` | `auth.uid() = id` para SELECT/INSERT/UPDATE. |
| `workspaces` | `user_id = auth.uid()` para CRUD. |
| `vaults` | Acesso se existir `workspace` do utilizador com `vault.workspace_id`. |
| `agents`, `commits`, `file_links` | Acesso via cadeia `vault` → `workspace` → `user_id = auth.uid()`. |
| `audit_log` | Leitura/inserção/atualização/remoção conforme `user_id` ou `vault_id` pertencente ao utilizador. |

### 2.2 Migração manual antiga (só `profiles`)

Ficheiro: [`supabase/migrations/20260406121000_create_profiles_table.sql`](../../supabase/migrations/20260406121000_create_profiles_table.sql)

Útil se criares `profiles` só pelo SQL Editor; a migração Prisma completa substitui/expande isto em ambientes alinhados com `init_schema`.

## 3. Duas famílias de tabelas no mesmo `public`

```
┌─────────────────────────────────────────────────────────────┐
│  schema public (Supabase)                                    │
├──────────────────────────────┬──────────────────────────────┤
│  OpenSync (Prisma)           │  Gitea (migrations do Gitea)  │
│  RLS + políticas auth.uid()  │  RLS sem políticas p/ API      │
│  Cliente Supabase + API Nest │  Só ligação direta Gitea       │
└──────────────────────────────┴──────────────────────────────┘
```

- **OpenSync**: o browser chama Supabase (Auth + eventualmente tabelas) e o Nest usa Prisma com `DATABASE_URL` — o user da connection string é normalmente o **mesmo** role que criou as tabelas; **dono ignora RLS**, por isso Prisma e triggers `SECURITY DEFINER` continuam a funcionar.

- **Gitea**: o contentor usa o user configurado em `GITEA__database__USER` (ex.: `postgres.xxx`). Esse user **criou** as tabelas `user`, `repository`, … — **dono ignora RLS**. Ativar só `ENABLE ROW LEVEL SECURITY` **sem** `CREATE POLICY` para `anon`/`authenticated` fecha a API Supabase a essas tabelas sem desligar o Gitea.

**Não uses `FORCE ROW LEVEL SECURITY`** nas tabelas do Gitea: forçaria o dono a passar pelas políticas e **poderia partir** o Gitea, a menos que cries políticas que reproduzam o comportamento interno do Gitea (não recomendado).

## 4. Script: RLS nas tabelas do Gitea (badge UNRESTRICTED)

O SQL dinâmico que **exclui** as tabelas da app e migrações Prisma está em [`gitea-supabase-postgres.md`](./gitea-supabase-postgres.md) (secção **7**). Executar **uma vez** no SQL Editor do projeto Supabase (idealmente após confirmar a lista `app_tables`).

Inclui exclusões para tabelas PostGIS comuns (`spatial_ref_sys`, …) se existirem.

Se adicionares novos modelos Prisma em `public`, **atualiza o array `app_tables`** nesse script antes de correr.

## 5. Papéis e o que “vê” cada um

| Actor | RLS aplicável? | Notas |
|--------|----------------|-------|
| Pedido PostgREST com JWT de utilizador | Sim | Avalia políticas com `auth.uid()`. |
| Pedido `anon` | Sim | Sem política permitindo → sem linhas. |
| **`service_role`** (servidor) | Ignora RLS no Supabase | Nunca no cliente. |
| **Prisma / Nest** (connection string) | Dono ou superuser ignora RLS | Migrações e queries da API. |
| **Gitea** (connection string) | Dono das tabelas Gitea ignora RLS | Metadados repos, users, etc. |

## 6. Checklist operacional

- [ ] Migração `init_schema` (ou equivalente) aplicada em **produção** — políticas OpenSync presentes.
- [ ] Script da secção 7 de [`gitea-supabase-postgres.md`](./gitea-supabase-postgres.md) executado se o Gitea partilha o mesmo `public` — tabelas Gitea deixam de mostrar UNRESTRICTED.
- [ ] Novas tabelas **OpenSync**: além de Prisma, adicionar `ENABLE ROW LEVEL SECURITY` + políticas no mesmo ficheiro de migração (ou migração incremental).
- [ ] Novas tabelas **só servidor** (sem cliente Supabase): RLS ligado sem políticas para `anon`/`authenticated`, ou políticas explícitas conforme o caso.
- [ ] Nunca commitar `service_role` no frontend.

## 7. Problemas frequentes

| Sintoma | Causa provável |
|---------|----------------|
| Cliente Supabase não vê linhas | Política em falta ou `auth.uid()` null (sessão inválida). |
| Prisma falha após ligar RLS | Raro se o role for dono; verificar se não usaste `FORCE ROW LEVEL SECURITY` nas tabelas erradas. |
| Gitea 500 após script | Lista `app_tables` enganou uma tabela **do Gitea** e excluiu-a — rever nomes; ou usar base dedicada ao Gitea. |
| Dashboard ainda mostra UNRESTRICTED | Tabela criada depois do script — voltar a correr o bloco `DO $$` ou ativar RLS manualmente nessa tabela. |

## 8. Referências

- Gitea + Postgres + script RLS (secção 7): [`gitea-supabase-postgres.md`](./gitea-supabase-postgres.md)
- Primeira instalação Gitea na VPS: [`gitea-ionos-first-install.md`](./gitea-ionos-first-install.md)
- Visão produto (RLS mencionado): [`../VISION.md`](../VISION.md)
