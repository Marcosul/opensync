# opensync-ubuntu

Sincroniza **qualquer pasta** no Ubuntu com um vault OpenSync. Sem OpenClaw, skill nem plugin — só este pacote, a API key do vault (dashboard) e o caminho do diretório.

A API usada é a do próprio OpenSync (`/api/agent/vaults/...`): sync bidirecional via Postgres; o Gitea no servidor é espelho assíncrono.

## Desenvolvimento

```bash
pnpm install
pnpm approve-builds   # se o better-sqlite3 precisar de compilar nativo
pnpm --filter @opensync/opensync-ubuntu exec tsc
node dist/cli.js init
node dist/cli.js run
node dist/cli.js status
node dist/cli.js update
```

Depois de instalado via `.deb`, pode usar:

```bash
opensync update
```

## Pacote .deb

```bash
bash apps/opensync-ubuntu/packaging/build-deb.sh 0.1.0
```

Requer `dpkg-deb`, Node 20+ e pnpm. O serviço systemd de utilizador fica em `/lib/systemd/user/opensync-ubuntu.service`.

## CI

Tag `opensync-ubuntu-v*` dispara `.gitea/workflows/opensync-ubuntu-deb.yml` (compatível com runners estilo GitHub Actions).
