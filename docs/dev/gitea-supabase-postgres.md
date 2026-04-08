# Gitea com PostgreSQL do Supabase

Este guia mostra como configurar o Gitea na VPS IONOS usando **PostgreSQL hospedado no Supabase** (em vez de SQLite), pensando em crescimento para milhares de usuários.

## Visão geral

- **Gitea** continua rodando na VPS (Docker).
- **Repos Git** continuam no volume local (`/data/git/repositories`).
- **Banco de metadados do Gitea** vai para um banco Postgres no Supabase.

## Estado atual (aplicado na VPS)

- Servidor: `216.250.124.232`
- Stack: `/opt/opensync/docker-compose.yml`
- `gitea.env` com Postgres (Supabase), por exemplo:
  - `GITEA__database__DB_TYPE=postgres`
  - `GITEA__database__HOST=aws-1-us-east-2.pooler.supabase.com:5432`
  - `GITEA__database__NAME=postgres`
  - `GITEA__database__USER=postgres.gpnxlfnjuxqhlsmxwfmc`
  - `GITEA__database__SSL_MODE=require`
- Backups: `gitea.env.bak.<timestamp>`
- `docker compose up -d`; raiz e `/api/healthz` com `HTTP 200` quando o serviço e a base estão corretos.
- `INSTALL_LOCK=true`; admin atual **`opensync-admin`** (`admin@opensync.space`) criado por CLI; senhas e tokens **só** em [`apps/api/.env`](../../apps/api/.env) e em `fly secrets` — não versionar.
- Modo privado inicial típico: `DISABLE_REGISTRATION=true`, `REQUIRE_SIGNIN_VIEW=true`.
- **`GITEA_ADMIN_TOKEN`**: definido no Gitea (ex.: token gerado com `gitea admin user create --access-token`) e replicado em `apps/api/.env` e `fly secrets set -a opensync-api`.

### Se a base Postgres estiver vazia (sem tabelas)

Após mudar o Gitea para Postgres, é obrigatório aplicar o schema. No contentor:

```bash
docker exec -u git opensync-gitea gitea migrate -c /data/gitea/conf/app.ini
```

Sem isto, os logs mostram `pq: relation "user" does not exist` e `/user/login` pode devolver **500**.

> Rotacionar senha no primeiro login se o assistente o exigir; revogar/regenerar token se houver exposição.

Referência oficial do Gitea para banco: [Database preparation](https://docs.gitea.io/en-us/database-prep/).

## 1) Preparar banco dedicado no Supabase

No projeto Supabase, crie um banco lógico para o Gitea (recomendado: separado do banco da aplicação).

No SQL Editor, execute:

```sql
create user gitea_user with password 'CHANGE_ME_STRONG_PASSWORD';
create database gitea_db owner gitea_user;
grant all privileges on database gitea_db to gitea_user;
```

Se teu plano/projeto não permitir `CREATE DATABASE`, usa o banco existente e ao menos um usuário dedicado + schema dedicado.

No setup atual foi usado o banco `postgres` existente para acelerar o bootstrap. Para produção de longo prazo, ainda é recomendado separar usuário/banco/schema para o Gitea.

## 2) String de conexão correta (Supabase)

Para Gitea, prefira **conexão direta** (porta `5432`) com SSL `require`.

Formato esperado:

```text
HOST=aws-0-REGION.pooler.supabase.com:5432
NAME=gitea_db
USER=gitea_user
PASSWD=...
SSL_MODE=require
```

Observações:

- Evita pooler em porta `6543` para Gitea no início (pode funcionar, mas adiciona camada e troubleshooting).
- Gitea precisa de conexão estável de app server para migrations/queries próprias.

## 3) Ajustar `gitea.env` na VPS

No servidor (`/opt/opensync/gitea.env`), trocar de SQLite para Postgres:

```env
USER_UID=1000
USER_GID=1000

GITEA__database__DB_TYPE=postgres
GITEA__database__HOST=aws-0-REGION.pooler.supabase.com:5432
GITEA__database__NAME=gitea_db
GITEA__database__USER=gitea_user
GITEA__database__PASSWD=CHANGE_ME_STRONG_PASSWORD
GITEA__database__SSL_MODE=require

GITEA__server__HTTP_PORT=3000
GITEA__server__SSH_LISTEN_PORT=22
GITEA__server__ROOT_URL=http://216.250.124.232:3000/
GITEA__server__DOMAIN=216.250.124.232
GITEA__server__SSH_DOMAIN=216.250.124.232
GITEA__server__SSH_PORT=2222
```

## 4) Reiniciar Gitea com nova configuração

Na VPS:

```bash
cd /opt/opensync
docker compose down
docker compose up -d
docker compose logs -f gitea
```

Se a base estiver acessível, o Gitea sobe e aplica schema automaticamente.

## 5) Assistente web (`/install`) com Postgres

Na tela inicial do Gitea ([http://216.250.124.232:3000/](http://216.250.124.232:3000/)):

- **Database Type**: `PostgreSQL`
- **Host**: igual ao `GITEA__database__HOST`
- **Username / Password**: `gitea_user` / senha
- **Database Name**: `gitea_db`
- **SSL**: `Require`

Os campos de servidor (`ROOT_URL`, domínio, portas) devem ficar coerentes com o `gitea.env`.

## 6) Produção e desenvolvimento

### Desenvolvimento local

- API local (`apps/api/.env`) aponta para o mesmo Gitea da VPS via `GITEA_URL=http://SEU_IP:3000`.
- Token admin do Gitea em `GITEA_ADMIN_TOKEN`.

### Produção (Fly)

- Definir secrets no Fly:

```bash
fly secrets set GITEA_URL=http://SEU_IP:3000 -a opensync-api
fly secrets set GITEA_ADMIN_TOKEN=SEU_TOKEN -a opensync-api
```

## 7) Supabase: badge «UNRESTRICTED» nas tabelas do Gitea

Guia completo (papéis, Prisma, Gitea, checklist): [`supabase-rls-implementation.md`](./supabase-rls-implementation.md).

No Table Editor, **UNRESTRICTED** significa **Row Level Security (RLS) desligada** nessa tabela.

- As tabelas do **OpenSync** (Prisma: `profiles`, `workspaces`, `vaults`, `agents`, `file_links`, `commits`, `audit_log`) devem ter **RLS + políticas** conforme a vossa política de segurança.
- As tabelas criadas pelo **Gitea** (`user`, `session`, `repository`, …) **não** usam o cliente Supabase — o Gitea liga-se ao Postgres diretamente. Mesmo assim, com RLS desligada, o Supabase avisa porque **PostgREST** (API `anon` / `authenticated`) pode expor dados se existirem `GRANT` inadequados.

**Comportamento em PostgreSQL:** com RLS **ligada** e **sem políticas** para o papel `anon` / `authenticated`, esses papéis **não** vêem linhas. O utilizador do Gitea no Postgres é normalmente **dono** das tabelas que o Gitea criou; o **dono ignora RLS** (salvo `FORCE ROW LEVEL SECURITY`), por isso o **contentor Gitea continua a funcionar**.

### SQL sugerido (correr no SQL Editor, projeto PRODUCTION)

1. Revisa a lista de exclusão `app_tables` — deve coincidir com as tabelas **da aplicação OpenSync** no `public` (ajusta se tiveres mais modelos Prisma).
2. Executa **uma vez**. Depois, no dashboard, as tabelas do Gitea devem deixar de aparecer como «UNRESTRICTED» (RLS ativo).

```sql
-- Ativa RLS em todas as tabelas de public que NÃO são da app OpenSync nem migrações Prisma.
-- Gitea: o role que cria as tabelas (dono) continua a aceder; anon/authenticated ficam sem políticas = sem acesso via API Supabase.

DO $$
DECLARE
  app_tables text[] := ARRAY[
    'profiles',
    'workspaces',
    'vaults',
    'agents',
    'file_links',
    'commits',
    'audit_log',
    '_prisma_migrations'
  ];
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relname = ANY (app_tables)
      -- Extensões PostGIS / sistema comuns em public (se existirem)
      AND c.relname NOT IN (
        'spatial_ref_sys',
        'geography_columns',
        'geometry_columns',
        'raster_columns',
        'raster_overviews'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    RAISE NOTICE 'RLS enabled: %', r.tablename;
  END LOOP;
END $$;
```

**Políticas nas tabelas OpenSync:** este script **não** cria políticas em `profiles`, `vaults`, etc. — isso continua ao vosso critério (já deveis ter RLS + policies para o que expõeis ao cliente Supabase).

**Alternativa de médio prazo:** base ou utilizador **Postgres dedicado só ao Gitea** (ver secção 1 deste guia), para não misturar metadados do Gitea com o projeto Supabase da app.

## 8) Checklist de operação para escala

- Backup diário do banco Supabase usado pelo Gitea.
- Backup de `/opt/opensync/gitea-data` (repos e anexos).
- Monitorar `docker logs` e uso de disco na VPS.
- Planejar migração para domínio + HTTPS (`git.opensync.space`) antes de abrir para tráfego amplo.

## 9) Riscos e cuidados

- **Não usar credenciais da aplicação** para o Gitea; use usuário próprio.
- Não commitar `gitea.env` com senha real.
- Se trocar host/domínio, atualizar `ROOT_URL` e validar URLs de clone.

## Referências internas

- Guia inicial SQLite: [gitea-ionos-first-install.md](./gitea-ionos-first-install.md)
- SSH Fly → IONOS: [fly-ionos-ssh.md](./fly-ionos-ssh.md)
- Deploy IONOS: [`deploy/ionos/`](../../deploy/ionos/)
