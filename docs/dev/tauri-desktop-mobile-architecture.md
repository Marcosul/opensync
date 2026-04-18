# Arquitetura e Plano — Desktop + Mobile (Tauri 2.0)

## Visão Geral

Tauri 2.0 suporta Desktop (Windows, macOS, Linux) e Mobile (iOS, Android) num único codebase Rust + WebView. O sync core Rust é uma crate compartilhada entre o daemon de sincronização headless (`apps/core`) e o app com UI (`apps/desktop`).

```
opensync/
├── apps/
│   ├── api/              (NestJS — existente)
│   ├── web/              (Next.js — existente)
│   ├── opensync-ubuntu/  (Node.js — deprecar após core/ estável)
│   ├── core/             ← NOVO: daemon headless Rust (.deb + systemd, VPS)
│   └── desktop/          ← NOVO: Tauri 2.0 (Desktop + Mobile, tem UI)
│
├── crates/
│   └── sync-core/        ← NOVO: biblioteca Rust compartilhada
│
└── packages/
    ├── ui/               ← NOVO: componentes shadcn extraídos do web
    └── types/            ← NOVO: tipos TypeScript compartilhados
```

---

## Estrutura Detalhada

### `crates/sync-core/` — Biblioteca Rust Compartilhada

```
crates/sync-core/
└── src/
    ├── watcher.rs      # file watching (notify crate) — desktop/core only
    ├── http_client.rs  # reqwest → API OpenSync
    ├── db.rs           # sqlx + SQLite (estado local, cursor)
    ├── git.rs          # operações Gitea (git2 / libgit2)
    └── conflict.rs     # lógica de resolução de conflito (409)
```

### `apps/core/` — Daemon VPS Headless (substitui opensync-ubuntu)

```
apps/core/
└── src/
    ├── main.rs         # CLI + loop de sync
    ├── config.rs       # leitura de config (TOML/env)
    └── daemon.rs       # integração systemd (sd_notify)
```

- Empacotado como `.deb` + unit file systemd
- Sem WebView, sem UI
- Comportamento idêntico ao `opensync-ubuntu` atual
- Deps: `sync-core`, `clap`, `tokio`, `config`

### `apps/desktop/` — App Tauri com UI

```
apps/desktop/
├── src/                # Frontend React (Vite)
│   ├── components/     # componentes específicos do desktop
│   ├── hooks/          # invoke() wrappers
│   ├── pages/
│   └── main.tsx
└── src-tauri/          # Backend Rust
    └── src/
        ├── main.rs
        └── commands/   # IPC handlers (usam sync-core)
```

---

## Camada IPC — Comandos Tauri

```rust
// src-tauri/src/commands/sync.rs
#[tauri::command]
async fn sync_vault(vault_id: String, direction: SyncDirection) -> Result<SyncResult, String>

#[tauri::command]
async fn watch_folder(path: String, vault_id: String) -> Result<(), String>

#[tauri::command]
async fn get_conflicts(vault_id: String) -> Result<Vec<Conflict>, String>

#[tauri::command]
async fn resolve_conflict(conflict_id: String, resolution: Resolution) -> Result<(), String>

#[tauri::command]
async fn authenticate(server_url: String, token: String) -> Result<Profile, String>
```

```typescript
// src/hooks/useSync.ts — invocação do frontend
import { invoke } from '@tauri-apps/api/core'

const result = await invoke<SyncResult>('sync_vault', { vaultId, direction: 'bidirectional' })
```

---

## Decisões Arquiteturais

### Frontend: Vite + React (não Next.js)

Next.js depende de servidor Node.js para SSR. Tauri serve arquivos estáticos. Portanto:
- `apps/desktop/src` → Vite + React
- `apps/web` continua Next.js
- Componentes genéricos migram para `packages/ui`

### Rust Core substitui opensync-ubuntu (Node.js → Rust)

| Função | opensync-ubuntu (Node.js) | sync-core (Rust) |
|--------|---------------------------|------------------|
| File watching | `chokidar` | `notify` crate |
| SQLite local | `better-sqlite3` | `sqlx` async |
| HTTP client | `axios` | `reqwest` |
| Git ops | `simple-git` | `git2` (libgit2) |
| Daemon | systemd unit | systemd unit (sd_notify) |

### Mobile — Limitações e Adaptações

| Recurso | Desktop / Core | Mobile (iOS/Android) |
|---------|-----------------|----------------------|
| File watching | `notify` contínuo | Polling agendado (5–15 min) |
| Background sync | Tauri background task | Push notification → foreground sync |
| Filesystem access | Irrestrito | Scoped (iOS Files API, Android SAF) |
| Git clone local | Sim | Não — apenas diff/sync via API |
| Offline editing | SQLite + sync posterior | SQLite + sync posterior |

---

## Dependências Rust (Cargo.toml)

```toml
# crates/sync-core/Cargo.toml
[dependencies]
reqwest    = { version = "0.12", features = ["json", "rustls-tls"] }
sqlx       = { version = "0.8",  features = ["sqlite", "runtime-tokio", "macros"] }
notify     = "6"
git2       = "0.19"
tokio      = { version = "1", features = ["full"] }
serde      = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow     = "1"

# apps/core/Cargo.toml
[dependencies]
sync-core  = { path = "../../crates/sync-core" }
clap       = { version = "4", features = ["derive"] }
config     = "0.14"
systemd    = "0.10"   # sd_notify
tokio      = { version = "1", features = ["full"] }

# apps/desktop/src-tauri/Cargo.toml
[dependencies]
sync-core                    = { path = "../../../crates/sync-core" }
tauri                        = { version = "2", features = ["tray-icon"] }
tauri-plugin-notification    = "2"
tauri-plugin-updater         = "2"
tauri-plugin-fs              = "2"
tauri-plugin-store           = "2"
tauri-plugin-keychain        = "2"
```

---

## Plano de Implementação em Fases

### Fase 1 — `crates/sync-core` + `apps/core` (3–4 semanas)

**Objetivo**: Substituir `opensync-ubuntu` por binário Rust com comportamento idêntico.

1. Criar workspace Cargo na raiz (`Cargo.toml` com members)
2. Implementar `crates/sync-core`:
   - Portar lógica de sync de `apps/opensync-ubuntu/src/`
   - Testes unitários para conflito, cursor, HTTP client
3. Implementar `apps/core/`:
   - CLI com `clap` (subcomandos: `start`, `status`, `sync-now`)
   - Integração `sd_notify` para systemd
   - Packaging `.deb` via `cargo-deb`
4. Manter `apps/opensync-ubuntu` em paralelo durante validação
5. CI: build Linux + teste de integração contra API local

**Entregável**: `.deb` funcional, substituto direto do daemon Node.js.

---

### Fase 2 — `packages/ui` + `packages/types` + `apps/desktop` Desktop (4–6 semanas)

**Objetivo**: App desktop com UI para macOS/Linux/Windows.

1. Extrair `packages/ui` de `apps/web/src/components/ui/`
2. Extrair `packages/types` (Vault, VaultFile, SyncToken, etc.)
3. Scaffold: `pnpm create tauri-app apps/desktop --template react-ts`
4. Frontend desktop:
   - Tela de login / configuração de servidor
   - Dashboard de vaults (lista + status sync)
   - Tray icon + notificações nativas
   - Conflict resolution UI (diff side-by-side)
5. CI matrix:
   ```yaml
   matrix:
     os: [ubuntu-latest, macos-latest, windows-latest]
   ```
6. Auto-update via `tauri-plugin-updater` (GitHub Releases)

**Entregável**: `.dmg` + `.AppImage` + `.msi` funcionais.

---

### Fase 3 — Mobile iOS (3–4 semanas)

**Objetivo**: App iOS.

1. Adicionar target iOS: `pnpm tauri ios init`
2. Adaptações iOS:
   - `UIDocumentPickerViewController` (Files app)
   - `BGAppRefreshTask` para background fetch
   - Keychain para tokens
   - APN (Apple Push Notifications)
3. Apple Developer Program obrigatório
4. Build: TestFlight → App Store

---

### Fase 4 — Mobile Android (3–4 semanas)

**Objetivo**: App Android com sync manual/agendado.

1. Adicionar target Android: `pnpm tauri android init`
2. Adaptar sync para mobile:
   - Polling agendado via WorkManager
   - Android Storage Access Framework (SAF) para seleção de pasta
3. UI responsiva: bottom navigation, gestos swipe
4. Push notifications via FCM (`tauri-plugin-push-notifications`)
5. Build: `.aab` para Google Play

---

### Fase 5 — Deprecação do opensync-ubuntu (após Fase 1 estável)

- Comunicar migration path aos usuários VPS
- Remover `apps/opensync-ubuntu` do monorepo

---

## CI/CD

```
Push → GitHub Actions
  ├── test:rust      (cargo test --workspace)
  ├── test:ts        (pnpm test)
  ├── build:core     → ubuntu → .deb
  ├── build:desktop
  │   ├── ubuntu  → .AppImage + .deb
  │   ├── macos   → .dmg
  │   └── windows → .msi
  ├── build:android  → .aab
  └── build:ios      → .ipa (macOS runner)
```

---

## Segurança

- Tokens armazenados no Keychain (macOS/iOS) / Credential Manager (Windows) / libsecret (Linux) via `tauri-plugin-keychain`
- TLS obrigatório: `rustls-tls` no `reqwest` (evita dependência de OpenSSL nativo para facilitar cross-compile)
- Sandbox Tauri: apenas capabilities declaradas explicitamente em `tauri.conf.json`
- `apps/core` VPS: token `osk_...` nunca gravado em texto plano (variável de ambiente ou secret manager)

---

## Compatibilidade com a API Existente

O app desktop e o core usam os mesmos endpoints que `apps/web`:
- Auth usuário: header `x-opensync-user-id`
- Auth core: `Authorization: Bearer ast_...`
- Conflitos: HTTP 409 com resolução manual (já implementado no backend)

Nenhum endpoint novo é necessário para a Fase 1 e 2.

---

## Checklist de Implementação

### Pré-requisitos / Contas e Certificados

- [ ] Criar conta Apple Developer Program (U$99/ano) — obrigatório para iOS
- [ ] Criar conta Google Play Console (U$25 único) — obrigatório para Android
- [ ] Criar conta Apple Developer para macOS notarization (incluída no Developer Program)
- [ ] Gerar Apple Distribution Certificate e Provisioning Profile (iOS + macOS)
- [ ] Gerar Android Keystore (`.jks`) e guardar em local seguro
- [ ] Configurar secrets no GitHub Actions: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_TEAM_ID`, `ANDROID_KEYSTORE`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

---

### Fase 1 — `crates/sync-core` + `apps/core`

#### Monorepo Rust
- [x] Criar `Cargo.toml` na raiz do monorepo com workspace members
- [x] Criar `crates/sync-core/` com estrutura de módulos

#### sync-core — Módulos Rust
- [x] `api.rs` — cliente HTTP para API OpenSync (reqwest, prepare-put→PUT→commit-put)
- [x] `db.rs` — SQLite local com rusqlite (migrations, cursor, estado, journal)
- [x] `engine.rs` — motor de sync (watcher notify, SSE, poll remoto, merge, reconcile)
- [x] `hash.rs` — SHA-256 UTF-8 (compatível com servidor)
- [x] `ignore.rs` — shouldIgnore com patterns e extensões
- [x] `merge.rs` — merge por linhas (similar crate), strip conflict markers, 3-way lite
- [x] `suppressed.rs` — SuppressedWrites com TTL (evita loop watcher→sync)
- [x] `config.rs` — SyncConfig, load/save config e token, resolve_user_path
- [x] Testes unitários — 45 testes: merge (10), hash (5), ignore (8), db (14), suppressed (5)

#### apps/core — Daemon VPS
- [x] `main.rs` — CLI com clap (subcomandos: `run`/`start`, `status`, `init`, `restart`, `stop`, `version`, `list-sync`, `list-vault`, `set-sync-dir`, `update`, `uninstall`)
- [x] Integração systemd (`sd_notify` via socket UNIX, sem dep externa)
- [x] Unit file systemd (`packaging/opensync.service`)
- [x] Endpoints user (`crates/sync-core/src/user_api.rs`): `fetch_me`, `list_user_vaults`, `create_user_vault`, `create_sync_token`
- [x] Packaging `.deb` via `cargo-deb` — script `pnpm core:deploy` (build + cargo-deb + upload Supabase) gera `target/debian/opensync_<X.Y.Z>_amd64.deb`
- [x] `Conflicts/Replaces/Provides: opensync-ubuntu` em `apps/core/Cargo.toml` + scripts `preinst`/`postinst` em `apps/core/packaging/debian/`
- [x] `.gitignore` atualizado com `target/` e `*.rs.bk`
- [x] CI GitHub Actions ([`core.yml`](../../.github/workflows/core.yml)): fmt, clippy, tests, build .deb, release por tag
- [x] CI Gitea ([`opensync-core-deb.yml`](../../.gitea/workflows/opensync-core-deb.yml)): build + .deb + SHA256 em tag `core-v*`
- [x] `rustfmt.toml` configurado
- [x] Testes unitários sync-core: 45 passa (`cargo test --workspace`)
- [x] Validação end-to-end em VPS real: `.deb` instalado, `opensync init` operacional, sync confirmado em produção

#### Deprecação
- [x] Instalador web ([`apps/web/src/app/install/ubuntu/route.ts`](../../apps/web/src/app/install/ubuntu/route.ts)) entrega o pacote `opensync` (Rust); upgrade automático sobre `opensync-ubuntu` via `Conflicts/Replaces`
- [x] Migration path: `curl -fsSL https://opensync.space/install/ubuntu | bash` → `preinst` para `opensync-ubuntu.service`, `dpkg` instala `opensync`, `opensync init` reconfigura
- [ ] Remover `apps/opensync-ubuntu` após validação em produção

---

### Fase 2 — Desktop (macOS / Linux / Windows)

#### Shared Packages — Fatia 1 ✅
- [x] `packages/ui/` configurado como workspace pnpm (`@opensync/ui`)
- [x] Componentes essenciais em `packages/ui/src/`: `Button`, `Input`, `Card*`, `Badge`, `Label` + `cn`
- [x] `packages/types/` (`@opensync/types`) com `UserVault`, `SyncResult`, `SyncStatus`, `ConflictEntry`, `AuthCredentials`, `DesktopVaultConfig`, `SyncEvent`, …
- [ ] Migrar restantes componentes shadcn (dropdown, tooltip, dialog) de `apps/web` para `packages/ui`
- [ ] Atualizar `apps/web` para consumir `packages/ui` (atualmente só usa `cn`)

#### Scaffold Tauri — Fatia 1 ✅
- [x] [`apps/desktop/`](../../apps/desktop/) criado manualmente (Vite + React 19 + Tailwind 4 + Tauri 2)
- [x] `pnpm-workspace.yaml` cobre `apps/*` e `packages/*` (sem alteração necessária)
- [x] [`apps/desktop/src-tauri/tauri.conf.json`](../../apps/desktop/src-tauri/tauri.conf.json): bundle id `space.opensync.desktop`, janela 1200×800, CSP restrita
- [x] [`apps/desktop/src-tauri/Cargo.toml`](../../apps/desktop/src-tauri/Cargo.toml) depende de `sync-core` via path
- [x] Cargo workspace inclui `apps/desktop/src-tauri` ([`Cargo.toml`](../../Cargo.toml))
- [x] `cargo check -p opensync-desktop` resolve toda a árvore Rust (falha apenas em libs do sistema GTK — esperado em sandbox)
- [x] `tsc --noEmit` em `apps/desktop` passa limpo

#### Frontend React (Vite) — Fatia 1 ✅
- [x] Tela de login com token `usk_*` ([`src/views/login.tsx`](../../apps/desktop/src/views/login.tsx)) — campo API URL + token, validação via `auth_login`
- [x] Dashboard de vaults ([`src/views/dashboard.tsx`](../../apps/desktop/src/views/dashboard.tsx)) — listar, criar, refrescar, logout
- [x] Tema light/dark via CSS variables ([`src/styles.css`](../../apps/desktop/src/styles.css))
- [x] Wrapper IPC tipado ([`src/lib/ipc.ts`](../../apps/desktop/src/lib/ipc.ts))
- [ ] Navegador de arquivos local (file tree) — Fatia 3
- [ ] Editor markdown rico (CodeMirror 6) — Fatia 4
- [ ] Suporte a wikilinks e backlinks — Fatia 4
- [ ] Graph view (reaproveitando D3 do `apps/web`) — Fatia 5
- [ ] Conflict resolution UI (diff side-by-side) — Fatia 3
- [ ] Configurações (servidor, intervalo de sync, tema) — Fatia 2

#### Backend Rust (Tauri commands) — Fatia 1 ✅
- [x] [`src-tauri/src/lib.rs`](../../apps/desktop/src-tauri/src/lib.rs) com `auth_login`, `auth_logout`, `auth_current`, `vaults_list`, `vaults_create`, `desktop_info`
- [x] Estado partilhado (`AppState`) com `reqwest::Client` e sessão em RAM
- [x] Plugins integrados: `tauri-plugin-shell`, `tauri-plugin-dialog`, `tauri-plugin-opener`
- [ ] `commands/sync.rs` — `sync_vault`, `watch_folder`, `get_conflicts`, `resolve_conflict` — Fatia 2
- [ ] `commands/fs.rs` — `list_local_files`, `open_folder_dialog` — Fatia 3
- [ ] Tray icon com menu de ações rápidas — Fatia 4
- [ ] Notificações nativas (sync concluído, conflitos) — Fatia 4
- [ ] Auto-update via `tauri-plugin-updater` — Fatia 5
- [ ] Armazenamento seguro de tokens via `keyring`/`tauri-plugin-stronghold` — Fatia 2

#### Publicação Desktop
- [ ] Configurar code signing macOS (Apple Developer ID)
- [ ] Configurar notarization macOS (Apple Notary Service)
- [ ] Gerar ícones para todas as plataformas (`tauri icon`)
- [ ] CI matrix: ubuntu / macos / windows
- [ ] GitHub Release com `.dmg`, `.AppImage`, `.deb`, `.msi`
- [ ] Página de download no site (`apps/web`)

---

### Fase 3 — Mobile iOS

#### Pré-requisitos iOS
- [ ] Mac com Xcode instalado (obrigatório para build iOS)
- [ ] Apple Developer Program ativo
- [ ] Bundle ID registrado no Apple Developer Portal (`com.opensync.app`)
- [ ] App ID criado com capabilities: Push Notifications, Background Modes
- [ ] Distribution Certificate gerado e instalado
- [ ] Provisioning Profile (App Store Distribution) criado

#### Scaffold iOS
- [ ] `pnpm tauri ios init`
- [ ] Configurar `Info.plist`: NSPhotoLibraryUsageDescription, NSDocumentsFolderUsageDescription
- [ ] Configurar Background Modes: `fetch`, `remote-notification`
- [ ] Adicionar ícones iOS (`AppIcon.appiconset`)
- [ ] Configurar splash screen

#### Funcionalidades iOS
- [ ] Acesso a arquivos via `UIDocumentPickerViewController` (Files app / iCloud Drive)
- [ ] Editor markdown responsivo para toque
- [ ] Polling agendado com `BGAppRefreshTask`
- [ ] Push notifications via APN (`tauri-plugin-push-notifications`)
- [ ] Keychain para armazenamento de tokens
- [ ] Suporte a Face ID / Touch ID para desbloqueio

#### UI Mobile
- [ ] Layout responsivo (bottom tab bar, gestos swipe)
- [ ] Editor markdown otimizado para teclado virtual
- [ ] Modo escuro / claro seguindo sistema

#### Publicação iOS
- [ ] Build de release: `pnpm tauri ios build --release`
- [ ] Submeter para TestFlight (beta interno)
- [ ] Testes no TestFlight com grupo de beta testers
- [ ] Criar listing no App Store Connect: nome, descrição, screenshots (6.5", 5.5", iPad)
- [ ] Preencher: Privacy Policy URL, Support URL, categorias
- [ ] Responder App Privacy questionnaire (data collection)
- [ ] Submeter para revisão da Apple
- [ ] Responder feedback da revisão se rejeitado
- [ ] Publicar na App Store

---

### Fase 4 — Mobile Android

#### Pré-requisitos Android
- [ ] Android Studio instalado
- [ ] Google Play Console conta ativa
- [ ] Gerar Android Keystore: `keytool -genkey -v -keystore opensync.jks`
- [ ] Guardar keystore em local seguro (nunca commitar)
- [ ] Registrar app no Google Play Console (`com.opensync.app`)

#### Scaffold Android
- [ ] `pnpm tauri android init`
- [ ] Configurar `AndroidManifest.xml`: permissions (INTERNET, READ/WRITE_EXTERNAL_STORAGE)
- [ ] Configurar `build.gradle`: applicationId, versionCode, versionName
- [ ] Adicionar ícones Android (mipmap-*)
- [ ] Configurar splash screen / adaptive icon

#### Funcionalidades Android
- [ ] Acesso a arquivos via Storage Access Framework (SAF)
- [ ] Polling agendado via WorkManager
- [ ] Push notifications via FCM (`tauri-plugin-push-notifications`)
- [ ] Armazenamento seguro de tokens (Android Keystore)
- [ ] Suporte a biometria (fingerprint / face unlock)

#### Publicação Android
- [ ] Build de release: `pnpm tauri android build --release`
- [ ] Assinar `.aab` com keystore de produção
- [ ] Submeter para Internal Testing no Google Play Console
- [ ] Testes na faixa de Internal Testing
- [ ] Promover para Closed Testing (beta)
- [ ] Criar listing: título, descrição curta/longa, screenshots (phone + tablet)
- [ ] Preencher: Privacy Policy URL, Content Rating questionnaire
- [ ] Declaração de permissões e finalidade no Play Console
- [ ] Submeter para revisão do Google
- [ ] Publicar na Google Play Store

---

### Infraestrutura / Backend (suporte aos apps)

- [ ] Endpoint de push notification no backend NestJS (registrar device token)
- [ ] Integração FCM (Android) no backend
- [ ] Integração APN (iOS) no backend
- [ ] Endpoint de verificação de versão / força de update
- [ ] Rate limiting específico para clientes mobile
- [ ] Logs e métricas de sync por plataforma
