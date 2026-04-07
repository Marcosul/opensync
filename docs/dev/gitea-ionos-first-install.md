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
- Arquivo `/opt/opensync/gitea.env` migrado de `sqlite3` para `postgres` (Supabase, SSL `require`).
- Backup da configuração anterior criado como `/opt/opensync/gitea.env.bak.YYYYMMDD-HHMMSS`.
- Serviço reiniciado com sucesso (`docker compose up -d`) e UI em [http://216.250.124.232:3000/](http://216.250.124.232:3000/) retornando `HTTP 200`.
- Instalação ainda pendente na tela `Initial Configuration` (precisa criar usuário admin).

### Atualização aplicada em produção

- `INSTALL_LOCK` alterado para `true` em `/opt/opensync/gitea-data/gitea/conf/app.ini`.
- `DISABLE_REGISTRATION=true` e `REQUIRE_SIGNIN_VIEW=true` (modo privado inicial).
- Usuário admin criado via CLI do Gitea:
  - `username`: `marcosul`
  - `email`: `marcosul@gmail.com`
  - `password temporária`: definida no momento da criação (não manter em documentação)
- Validação: página inicial deixou de mostrar `Initial Configuration` e passou para `Sign In`.

### Token para API (executado)

- Token de acesso foi gerado para o usuário `marcosul` via CLI (`gitea admin user generate-access-token`).
- `GITEA_ADMIN_TOKEN` foi atualizado em [`apps/api/.env`](../../apps/api/.env) (arquivo local, não versionado).
- `GITEA_ADMIN_TOKEN` e `GITEA_URL` foram aplicados em produção com `fly secrets set -a opensync-api`.
- Validação feita com `fly secrets list` (status `Deployed`).

> Segurança: não armazenar token/senha em documentação. Se houver suspeita de exposição, revogar o token no Gitea e gerar outro.

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

1. No Gitea: **Settings** (utilizador) ou **Site Administration** → **Applications** → **Generate New Token**.
2. Permissões mínimas típicas para criar repos e Git: **repository** (read/write) e **admin** se a API for criar organizações/repos em teu nome (ajusta ao que implementares).
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
- Deploy Docker na IONOS: [`deploy/ionos/`](../../deploy/ionos/)
