# Gitea na VPS IONOS — primeira instalação (dev e produção)

URL atual do assistente: [http://216.250.124.232:3000/](http://216.250.124.232:3000/) (substitui pelo teu IP se mudares de máquina).

O contentor já recebe variáveis em [`deploy/ionos/gitea.env`](../../deploy/ionos/gitea.env) (no servidor em `/opt/opensync/gitea.env`). O assistente deve **alinhar** com esses valores para os clones HTTP/SSH e notificações ficarem corretos.

Documentação oficial Docker: [Install Gitea with Docker](https://docs.gitea.io/en-us/install-with-docker/).

## 1. Antes de clicar em «Install Gitea»

### Firewall na VPS (IONOS + `ufw`, se estiveres a usar)

Abre as portas que o compose expõe:

```bash
ufw allow 22/tcp
ufw allow 3000/tcp
ufw allow 2222/tcp
ufw reload
```

- **3000** — interface web e `git clone` por HTTPS (através do Gitea).
- **2222** — SSH Git (mapeamento `2222:22` no [`deploy/ionos/docker-compose.yml`](../../deploy/ionos/docker-compose.yml)).

Na consola IONOS, confirma também **regras de grupo/firewall** da cloud para o mesmo IP público.

### Produção (Fly) a falar com o Gitea

A API em Fly (`opensync-api`) precisa de alcançar `http://216.250.124.232:3000` (ou o IP atual). Se o Gitea só aceitar ligações de IPs conhecidos, permite saída/entrada conforme a tua política — em muitos setups basta a porta **3000** aberta na VPS para o mundo ou para a origem do Fly.

## Estado atual (executado)

- `docker compose` ativo na VPS `216.250.124.232` com `gitea/gitea:1.22.6`.
- Arquivo `/opt/opensync/gitea.env` com **PostgreSQL** (Supabase, SSL `require`); backups em `gitea.env.bak.<timestamp>`.
- Serviço a responder em [http://216.250.124.232:3000/](http://216.250.124.232:3000/) (`HTTP 200` na raiz; `/user/login` após migrações).
- Se após apontar para Postgres o Gitea mostrar erros `pq: relation "user" does not exist` ou `/user/login` com **500**, correr **uma vez** no contentor:  
  `docker exec -u git opensync-gitea gitea migrate -c /data/gitea/conf/app.ini`  
  (ver também [gitea-supabase-postgres.md](./gitea-supabase-postgres.md).)

### Atualização aplicada em produção

- `INSTALL_LOCK=true` em `/opt/opensync/gitea-data/gitea/conf/app.ini`.
- Modo privado inicial: `DISABLE_REGISTRATION=true`, `REQUIRE_SIGNIN_VIEW=true` (ajustável).
- Utilizador **admin** criado via CLI (`gitea admin user create`):
  - `username`: `opensync-admin`
  - `email`: `admin@opensync.space`
  - senha e token gerados na criação — **guardar só** em [`apps/api/.env`](../../apps/api/.env) e em secrets da Fly; **não** repetir em documentação.

### Token para API (executado)

- `GITEA_ADMIN_TOKEN` atualizado em [`apps/api/.env`](../../apps/api/.env) (local, não versionado).
- Produção: `fly secrets set GITEA_URL=... GITEA_ADMIN_TOKEN=... -a opensync-api` (confirmar com `fly secrets list`).

> Segurança: não armazenar token nem senha em Markdown. Em caso de exposição, revogar o token no Gitea e atualizar `.env` + Fly.

#### Permissões obrigatórias do token (OpenSync)

A API NestJS cria **uma organização Gitea por workspace** (`POST /api/v1/orgs`) e **repositórios privados** nessa org (`POST /api/v1/orgs/{org}/repos`). O **Personal Access Token** (PAT) tem de incluir pelo menos:

| Scope (Gitea 1.22+ / token com scopes finos) | Motivo |
|-----------------------------------------------|--------|
| **write:organization** | Criar org por workspace (`ws` + UUID sem hífens). |
| **write:repository** | Criar repos dentro dessas orgs (em geral “All repositories” ou equivalente na UI). |

Se o Gitea só oferecer token **clássico** (“full access” / todas as permissões de API), esse formato também serve para a conta `opensync-admin` (ou a que gerires).

**Regenerar e guardar**

1. Gitea → utilizador **opensync-admin** (ou o dono do token) → **Settings** → **Applications** → **Generate New Token**.
2. Marcar os scopes acima (ou token clássico com acesso total à API).
3. Local: colar em `apps/api/.env` → `GITEA_ADMIN_TOKEN=gta_...` (ficheiro não versionado).
4. Fly: `fly secrets set GITEA_ADMIN_TOKEN='gta_...' -a opensync-api` (usa aspas se o shell interpretar caracteres especiais).
5. `fly deploy -a opensync-api` (ou reiniciar a máquina) para carregar o novo secret.

## 2. Assistente — valores recomendados

Preenche **exatamente** como abaixo (ajusta só o IP se não for o teu).

### Database Settings (atual: PostgreSQL no Supabase)

| Campo | Valor |
|--------|--------|
| Database Type | **PostgreSQL** |
| Host | `aws-1-us-east-2.pooler.supabase.com:5432` |
| Username | `postgres.gpnxlfnjuxqhlsmxwfmc` |
| Password | usar o mesmo segredo configurado em `/opt/opensync/gitea.env` |
| Database Name | `postgres` |
| SSL | `Require` |

### General Settings

| Campo | Valor |
|--------|--------|
| Site Title | `opensync` (ou `opensync.space Gitea`) |
| Repository Root Path | `/data/git/repositories` |
| Git LFS Root Path | deixar vazio (ou `/data/git/lfs` se quiseres LFS já) |
| Run As Username | `git` (utilizador interno da imagem) |
| Server Domain | `216.250.124.232` |
| SSH Server Port | `2222` |
| Gitea HTTP Listen Port | `3000` |
| Gitea Base URL | `http://216.250.124.232:3000/` |
| Log Path | `/data/gitea/log` |

Confirma que **Gitea Base URL** termina com `/` e coincide com o endereço que vais usar no browser e na API.

### Optional Settings (recomendado)

- **Disable Self-Registration** — ativar para só administradores criarem contas (melhor para um Gitea de equipa/produção).
- **Require Sign-In to View Pages** — opcional; se ativares, o browser tem de estar autenticado para ver repos públicos (útil em ambientes fechados).

### Administrator Account Settings

Cria a conta de administrador (obrigatório na prática):

- **Username**, **Email**, **Password** — escolhe credenciais fortes; guarda-as num gestor de passwords.
- Não commits estas credenciais no repositório.

### Environment Configuration

Na parte inferior da página, o assistente mostra variáveis `GITEA__…` aplicadas. Devem estar coerentes com `/opt/opensync/gitea.env` no servidor (ROOT_URL, DOMAIN, SSH_PORT e os campos `GITEA__database__*` de Postgres).

## 3. Clicar em «Install Gitea»

Aguarda o redirecionamento. Se houver erro de permissões ou caminho, verifica no servidor:

```bash
cd /opt/opensync
docker compose logs -f gitea
```

## 4. Depois do login (pós-instalação)

### 4.1 Token para a API NestJS

1. No Gitea: **Settings** → **Applications** → **Generate New Token** (utilizador que deve ser dono das orgs/repos criados pela API, p.ex. `opensync-admin`).
2. **Scopes mínimos:** **write:organization** e **write:repository** (ver tabela na secção “Permissões obrigatórias” acima). Alternativa: token clássico com acesso completo à API.
3. Coloca o token em:

| Ambiente | Variável |
|----------|----------|
| Local | [`apps/api/.env`](../../apps/api/.env) — `GITEA_ADMIN_TOKEN=...` |
| Fly | `fly secrets set GITEA_ADMIN_TOKEN=... -a opensync-api` |

### 4.2 URL base do Gitea na API

Define o mesmo URL que usas para abrir o Gitea no browser:

```env
GITEA_URL=http://216.250.124.232:3000
```

- **Desenvolvimento** (máquina local): `apps/api/.env`.
- **Produção** (Fly): secret ou variável `GITEA_URL` igual ao URL público do Gitea.

Sem barra final é aceite pela maioria dos clientes; se algum código exigir, usa a mesma forma em todo o lado.

### 4.3 Organização e repos de vaults

Segue a convenção em [`deploy/ionos/VAULT-REPOS.txt`](../../deploy/ionos/VAULT-REPOS.txt): criar uma organização (ex. `opensync`) e repositórios por vault (`user-id/agent-name` ou `vault-<uuid>`).

### 4.4 SSH Git (clone/push pela porta 2222)

Exemplo de remote SSH (quando existir repo `opensync/me-vault`):

```text
ssh://git@216.250.124.232:2222/opensync/me-vault.git
```

O utilizador `git` no Gitea usa as chaves registadas no perfil Gitea (não confundir com SSH para `root` na VPS).

## 5. HTTPS e domínio mais tarde

Quando tiveres domínio (ex. `git.opensync.space`) atrás de **Cloudflare** ou outro proxy:

1. Ajusta **Gitea Base URL** e **ROOT_URL** para `https://seu-dominio/` nas definições do Gitea (e/ou em `gitea.env` + reinício do contentor).
2. Atualiza `GITEA_URL` na API e tokens se necessário.
3. Preferir TLS na extremidade (proxy) e manter HTTP interno se for o teu desenho.

## 6. Referências cruzadas

- SSH Fly → VPS: [`fly-ionos-ssh.md`](./fly-ionos-ssh.md)
- Gitea + Supabase (Postgres, RLS / badge UNRESTRICTED): [`gitea-supabase-postgres.md`](./gitea-supabase-postgres.md) — secção 7; detalhe: [`supabase-rls-implementation.md`](./supabase-rls-implementation.md)
- Deploy Docker na IONOS: [`deploy/ionos/`](../../deploy/ionos/)
