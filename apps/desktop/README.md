# OpenSync Desktop (Tauri 2)

Aplicação desktop nativa (macOS / Linux / Windows) construída com **Tauri 2 +
React 19 + Vite + Tailwind 4**, partilhando o motor Rust [`crates/sync-core`](../../crates/sync-core)
com o daemon [`apps/core`](../core).

## Estrutura

```text
apps/desktop/
├── package.json              # frontend (Vite + React)
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx              # bootstrap React
│   ├── app.tsx               # shell + routing por estado
│   ├── styles.css            # Tailwind 4 + tokens
│   ├── lib/
│   │   └── ipc.ts            # wrappers tipados sobre invoke()
│   └── views/
│       ├── login.tsx         # autenticação por token usk_*
│       └── dashboard.tsx     # lista/cria vaults
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    ├── capabilities/
    │   └── default.json
    ├── icons/
    │   └── icon.png          # placeholder (substituir por arte real)
    └── src/
        ├── main.rs
        └── lib.rs            # comandos IPC: auth_*, vaults_*, desktop_info
```

## Desenvolvimento

```bash
# instalar deps (uma vez)
pnpm install

# dev (Vite + Tauri)
pnpm --filter @opensync/desktop tauri:dev
```

> ⚠️ Em Linux são precisos pacotes do sistema (gtk, webkit, libsoup). Ver
> <https://v2.tauri.app/start/prerequisites/>.

## Build

```bash
pnpm --filter @opensync/desktop tauri:build
```

Gera bundles (`.dmg`, `.deb`, `.AppImage`, `.msi`) em `apps/desktop/src-tauri/target/release/bundle/`.

## Comandos IPC disponíveis

Definidos em [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs). Todos retornam
`Promise<T>` no frontend via [`src/lib/ipc.ts`](src/lib/ipc.ts).

| Comando         | Frontend                | Descrição                                  |
|-----------------|-------------------------|--------------------------------------------|
| `desktop_info`  | `ipc.desktopInfo()`     | Versão, plataforma, URL API por defeito.  |
| `auth_login`    | `ipc.login(...)`        | Valida token `usk_*` contra `/user/me`.    |
| `auth_logout`   | `ipc.logout()`          | Limpa sessão em memória.                   |
| `auth_current`  | `ipc.currentSession()`  | Devolve sessão atual ou `null`.            |
| `vaults_list`   | `ipc.listVaults()`      | `GET /user/vaults`.                        |
| `vaults_create` | `ipc.createVault(name)` | `POST /user/vaults`.                       |

## Próximos passos (Fase 2 — Fatia 2)

- Comando `vault_sync(vault_id, sync_dir)` chamando `sync_core::engine`.
- Tray icon + notificações nativas.
- Conflict resolution UI (diff side-by-side).
- Persistir sessão em `keyring` nativo (em vez de só RAM).
