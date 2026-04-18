use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use std::io::{self, BufRead, Write};
use std::process::Command as SysCmd;
use sync_core::{
    config::{
        config_path, default_ignore, load_config, load_token, resolve_user_path, save_config,
        save_token, SyncConfig, DEFAULT_MAX_FILE_SIZE_BYTES, DEFAULT_POLL_INTERVAL_SECONDS,
    },
    db,
    engine::SyncEngine,
    user_api,
};

const DEFAULT_API_URL: &str = "https://api.opensync.space/api";
const SUPABASE_INSTALLER_BASE: &str =
    "https://gpnxlfnjuxqhlsmxwfmc.supabase.co/storage/v1/object/public/installer";
const SYSTEMD_UNIT: &str = "opensync";
const PKG_NAME: &str = "opensync";
const SETTINGS_TOKENS_URL: &str = "https://opensync.space/settings?section=access-tokens";
const LOGIN_URL: &str = "https://opensync.space/login";

#[derive(Parser)]
#[command(
    name = "opensync",
    about = "Daemon de sincronização bidirecional OpenSync (Rust)",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Cmd>,
}

#[derive(Subcommand)]
enum Cmd {
    /// Iniciar o daemon de sincronização
    Run,
    /// Alias de run
    Start,
    /// Alias de run
    Sync,
    /// Mostrar status da sincronização (cursor, pendentes, conflitos)
    Status,
    /// Configura conta, vault e diretório local; ativa o serviço systemd do utilizador
    Init,
    /// Reinicia o serviço local opensync (systemd --user)
    Restart,
    /// Para o serviço local opensync (systemd --user)
    Stop,
    /// Mostra a versão instalada
    Version,
    /// Mostra vault e diretório local atualmente sincronizados
    ListSync,
    /// Lista os vaults da conta usando token usk_
    ListVault,
    /// Troca o diretório local de sincronização do vault atual
    SetSyncDir { dir: Option<String> },
    /// Atualiza para a última versão (.deb) e reinicia o serviço local
    Update,
    /// Remove o pacote do sistema (mantém configuração local)
    Uninstall,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "opensync=info,sync_core=info".into()),
        )
        .without_time()
        .init();

    let cli = Cli::parse();

    match cli.command.unwrap_or(Cmd::Run) {
        Cmd::Run | Cmd::Start | Cmd::Sync => cmd_run().await,
        Cmd::Status => cmd_status(),
        Cmd::Init => cmd_init().await,
        Cmd::Restart => cmd_restart(),
        Cmd::Stop => cmd_stop(),
        Cmd::Version => cmd_version(),
        Cmd::ListSync => cmd_list_sync(),
        Cmd::ListVault => cmd_list_vault().await,
        Cmd::SetSyncDir { dir } => cmd_set_sync_dir(dir),
        Cmd::Update => cmd_update().await,
        Cmd::Uninstall => cmd_uninstall(),
    }
}

// ── run / status ──────────────────────────────────────────────────────────────

async fn cmd_run() -> Result<()> {
    let cfg = load_config().context("carregando config")?;
    let token = load_token().context("carregando token")?;

    #[cfg(target_os = "linux")]
    notify_systemd_ready();

    SyncEngine::new(cfg, token)?.run().await
}

fn cmd_status() -> Result<()> {
    let cfg = load_config().context("carregando config")?;
    let database = db::open(&cfg).context("abrindo SQLite")?;

    let cursor = db::get_remote_cursor(&database);
    let device_id =
        db::get_meta(&database, "device_id").unwrap_or_else(|| "(não inicializado)".into());
    let pending = db::list_pending_merge_paths(&database);
    let deleted = db::list_deleted_paths(&database);
    let unprocessed = db::list_unprocessed_journal(&database, 100);

    println!("OpenSync — status");
    println!("  vault_id   : {}", cfg.vault_id);
    println!("  sync_dir   : {}", cfg.sync_dir);
    println!("  api_url    : {}", cfg.api_url);
    println!("  device_id  : {device_id}");
    println!("  cursor     : {cursor}");
    println!("  poll       : {}s", cfg.poll_interval_seconds);
    println!("  pending merges  : {}", pending.len());
    println!("  deletados remotos: {}", deleted.len());
    println!("  journal pendente : {}", unprocessed.len());

    if !pending.is_empty() {
        println!("\nPending merges:");
        for p in &pending {
            println!("  - {p}");
        }
    }

    Ok(())
}

// ── version / list-sync ───────────────────────────────────────────────────────

fn cmd_version() -> Result<()> {
    println!("opensync v{}", env!("CARGO_PKG_VERSION"));
    Ok(())
}

fn cmd_list_sync() -> Result<()> {
    let cfg = load_config().context("carregando config")?;
    println!("OpenSync — sincronizacao local");
    println!("  vaultId : {}", cfg.vault_id);
    println!("  syncDir : {}", cfg.sync_dir);
    println!("  apiUrl  : {}", cfg.api_url);
    println!("  poll    : {}s", cfg.poll_interval_seconds);
    Ok(())
}

fn cmd_set_sync_dir(arg_dir: Option<String>) -> Result<()> {
    let mut cfg = load_config().context("carregando config")?;
    let raw = match arg_dir {
        Some(d) if !d.trim().is_empty() => d,
        _ => prompt_input(&format!("Novo diretorio de sincronizacao [{}]", cfg.sync_dir))?,
    };
    let raw = if raw.trim().is_empty() {
        cfg.sync_dir.clone()
    } else {
        raw
    };
    let resolved = resolve_user_path(&raw);
    if resolved.is_empty() {
        bail!("diretorio invalido");
    }
    std::fs::create_dir_all(&resolved).context("criar sync_dir")?;
    cfg.sync_dir = resolved.clone();
    save_config(&cfg)?;
    println!("✅ Diretorio de sincronizacao atualizado.");
    println!("  vaultId : {}", cfg.vault_id);
    println!("  syncDir : {}", cfg.sync_dir);
    println!("  Dica: execute `opensync restart` para aplicar no servico em background.");
    Ok(())
}

// ── systemd helpers ───────────────────────────────────────────────────────────

fn run_command_inherit(cmd: &str, args: &[&str]) -> Result<()> {
    let status = SysCmd::new(cmd)
        .args(args)
        .status()
        .with_context(|| format!("falha a executar {cmd}"))?;
    if !status.success() {
        bail!(
            "{cmd} {} falhou (exit={:?})",
            args.join(" "),
            status.code()
        );
    }
    Ok(())
}

fn try_command(cmd: &str, args: &[&str]) -> bool {
    SysCmd::new(cmd)
        .args(args)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn cmd_restart() -> Result<()> {
    run_command_inherit("systemctl", &["--user", "daemon-reload"])?;
    run_command_inherit("systemctl", &["--user", "restart", SYSTEMD_UNIT])?;
    let _ = try_command(
        "systemctl",
        &["--user", "status", SYSTEMD_UNIT, "--no-pager", "--lines=3"],
    );
    println!("✅ Servico reiniciado.");
    Ok(())
}

fn cmd_stop() -> Result<()> {
    run_command_inherit("systemctl", &["--user", "stop", SYSTEMD_UNIT])?;
    let _ = try_command(
        "systemctl",
        &["--user", "status", SYSTEMD_UNIT, "--no-pager", "--lines=3"],
    );
    println!("✅ Servico parado.");
    Ok(())
}

fn cmd_uninstall() -> Result<()> {
    println!("OpenSync — uninstall");
    let _ = try_command("systemctl", &["--user", "stop", SYSTEMD_UNIT]);
    let _ = try_command("systemctl", &["--user", "disable", SYSTEMD_UNIT]);
    let _ = try_command("systemctl", &["--user", "daemon-reload"]);
    if is_root() {
        run_command_inherit("dpkg", &["-r", PKG_NAME])?;
    } else {
        run_command_inherit("sudo", &["dpkg", "-r", PKG_NAME])?;
    }
    println!("✅ OpenSync removido do sistema.");
    Ok(())
}

#[cfg(target_os = "linux")]
fn notify_systemd_ready() {
    if let Ok(sock_path) = std::env::var("NOTIFY_SOCKET") {
        use std::os::unix::net::UnixDatagram;
        if let Ok(sock) = UnixDatagram::unbound() {
            sock.send_to(b"READY=1", &sock_path).ok();
        }
    }
}

#[cfg(unix)]
fn is_root() -> bool {
    extern "C" {
        fn geteuid() -> u32;
    }
    unsafe { geteuid() == 0 }
}

#[cfg(not(unix))]
fn is_root() -> bool {
    false
}

// ── update ────────────────────────────────────────────────────────────────────

async fn cmd_update() -> Result<()> {
    let version = env!("CARGO_PKG_VERSION");
    let default_url = format!("{SUPABASE_INSTALLER_BASE}/{PKG_NAME}_{version}_amd64.deb");
    let deb_url = std::env::var("OPENSYNC_UPDATE_DEB_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(default_url);

    let tmp_dir = std::env::var("TMPDIR").unwrap_or_else(|_| "/tmp".into());
    let tmp_path = format!(
        "{tmp_dir}/opensync-update-{}.deb",
        chrono::Utc::now().timestamp_millis()
    );

    println!("OpenSync — update");
    println!("  pacote: {deb_url}");
    println!("  baixando...");

    let client = reqwest::Client::builder()
        .build()
        .context("reqwest client")?;
    let res = client
        .get(&deb_url)
        .send()
        .await
        .context("download deb")?;
    if !res.status().is_success() {
        bail!("falha ao baixar pacote ({})", res.status());
    }
    let bytes = res.bytes().await.context("ler corpo do .deb")?;
    std::fs::write(&tmp_path, &bytes).context("gravar .deb temporario")?;
    println!("  arquivo: {tmp_path}");

    println!("  instalando .deb...");
    let install_result = if is_root() {
        run_command_inherit("dpkg", &["-i", &tmp_path])
    } else {
        run_command_inherit("sudo", &["dpkg", "-i", &tmp_path])
    };

    let _ = std::fs::remove_file(&tmp_path);
    install_result?;

    println!("  reiniciando servico local...");
    run_command_inherit("systemctl", &["--user", "daemon-reload"])?;
    run_command_inherit("systemctl", &["--user", "restart", SYSTEMD_UNIT])?;
    let _ = try_command(
        "systemctl",
        &["--user", "status", SYSTEMD_UNIT, "--no-pager", "--lines=3"],
    );
    println!("\n✅ OpenSync atualizado e servico reiniciado.");
    Ok(())
}

// ── list-vault ────────────────────────────────────────────────────────────────

async fn cmd_list_vault() -> Result<()> {
    let api_url = DEFAULT_API_URL.to_string();
    let client = reqwest::Client::builder().build().context("reqwest client")?;
    let (token, me) = prompt_usk_token_until_valid(&client, &api_url).await?;
    let vaults = user_api::list_user_vaults(&client, &api_url, &token).await?;
    println!("\nVaults de {}:", me.email);
    if vaults.is_empty() {
        println!("  (nenhum vault)");
        return Ok(());
    }
    for (i, v) in vaults.iter().enumerate() {
        println!(
            "  {}. {} [{}] — workspace: {}",
            i + 1,
            v.name,
            v.id,
            v.workspace_name
        );
    }
    Ok(())
}

// ── init ──────────────────────────────────────────────────────────────────────

async fn cmd_init() -> Result<()> {
    let api_url = DEFAULT_API_URL.to_string();
    let client = reqwest::Client::builder().build().context("reqwest client")?;

    println!("OpenSync — sincroniza qualquer pasta com um vault OpenSync");
    println!("──────────────────────────────────────────────────────────────────\n");
    println!("  Nao tem conta? Crie uma em: {LOGIN_URL}\n");

    let (usk_token, _me) = prompt_usk_token_until_valid(&client, &api_url).await?;

    println!("\nBuscando seus vaults...");
    let vaults = user_api::list_user_vaults(&client, &api_url, &usk_token)
        .await
        .unwrap_or_else(|e| {
            eprintln!("Aviso: nao foi possivel listar vaults: {e}");
            Vec::new()
        });

    let (vault_id, vault_name) = if vaults.is_empty() {
        println!("\nVoce nao possui vaults. Crie seu primeiro vault:");
        let name_input = prompt_input("Nome do vault [Meu Vault]")?;
        let name = if name_input.trim().is_empty() {
            "Meu Vault".to_string()
        } else {
            name_input
        };
        println!("Criando vault...");
        let created = user_api::create_user_vault(&client, &api_url, &usk_token, &name)
            .await
            .context("criar vault")?;
        println!("✓ Vault \"{}\" criado.", created.name);
        (created.id, created.name)
    } else {
        println!("\nSeus vaults:");
        for (i, v) in vaults.iter().enumerate() {
            println!("  {}. {}  [{}]", i + 1, v.name, v.workspace_name);
        }
        println!("  {}. + Criar novo vault", vaults.len() + 1);

        let choice = prompt_input("\nEscolha (numero) [1]")?;
        let idx = choice.trim().parse::<usize>().unwrap_or(1).saturating_sub(1);

        if idx == vaults.len() {
            let name = prompt_input("Nome do novo vault")?;
            if name.trim().is_empty() {
                bail!("nome do vault obrigatorio");
            }
            println!("Criando vault...");
            let created = user_api::create_user_vault(&client, &api_url, &usk_token, &name)
                .await
                .context("criar vault")?;
            println!("✓ Vault \"{}\" criado.", created.name);
            (created.id, created.name)
        } else if idx < vaults.len() {
            let v = vaults[idx].clone();
            println!("✓ Vault selecionado: {}", v.name);
            (v.id, v.name)
        } else {
            bail!("escolha invalida");
        }
    };

    let home = std::env::var("HOME").unwrap_or_else(|_| "/home".into());
    let safe_name: String = vault_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '-' })
        .collect();
    let default_dir = format!("{home}/Documents/{safe_name}");
    let sync_dir_raw = prompt_input(&format!("\nPasta local a sincronizar [{default_dir}]"))?;
    let sync_dir_raw = if sync_dir_raw.trim().is_empty() {
        default_dir
    } else {
        sync_dir_raw
    };
    let sync_dir = resolve_user_path(&sync_dir_raw);
    if sync_dir.is_empty() {
        bail!("pasta obrigatoria");
    }

    println!("\nGerando token de sync...");
    let sync_token = user_api::create_sync_token(&client, &api_url, &usk_token, &vault_id)
        .await
        .context("gerar sync-token")?;
    println!("✓ Token de sync gerado.");

    let cfg = SyncConfig {
        api_url: api_url.clone(),
        vault_id: vault_id.clone(),
        sync_dir: sync_dir.clone(),
        poll_interval_seconds: DEFAULT_POLL_INTERVAL_SECONDS.max(5),
        ignore: default_ignore(),
        max_file_size_bytes: DEFAULT_MAX_FILE_SIZE_BYTES,
    };
    std::fs::create_dir_all(&sync_dir).context("criar sync_dir")?;
    save_config(&cfg)?;
    save_token(&sync_token)?;

    println!("\n✓ Configuracao salva:");
    println!("  vault  : {vault_name}");
    println!("  pasta  : {sync_dir}");
    println!("  config : {}", config_path().display());

    println!("\nA activar e reiniciar o servico systemd (utilizador)…");
    if let Ok(user) = std::env::var("USER") {
        let _ = try_command("loginctl", &["enable-linger", &user]);
    }
    let _ = try_command("systemctl", &["--user", "daemon-reload"]);
    let enable_ok = try_command("systemctl", &["--user", "enable", SYSTEMD_UNIT]);
    let restart_ok = try_command("systemctl", &["--user", "restart", SYSTEMD_UNIT]);

    if enable_ok && restart_ok {
        println!("\n✓ Servico opensync reiniciado e habilitado no boot.");
        println!("  O poll remoto corre em background.");
        println!("  Logs:   journalctl --user -u {SYSTEMD_UNIT} -f");
        println!("  Status: opensync status");
    } else {
        println!("\nNao foi possivel reiniciar o servico. Comandos manuais:");
        println!("  loginctl enable-linger $USER");
        println!("  systemctl --user daemon-reload");
        println!("  systemctl --user enable {SYSTEMD_UNIT}");
        println!("  systemctl --user restart {SYSTEMD_UNIT}");
    }

    println!("\n──────────────────────────────────────────────────────────────────");
    println!("  ✅ Instalado com sucesso! — OpenSync esta pronto a sincronizar.");
    println!("──────────────────────────────────────────────────────────────────\n");
    Ok(())
}

// Suprimir aviso sobre `chrono` quando algumas combos de features estiverem ativas.
#[allow(dead_code)]
fn _force_chrono_link() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ── prompts ───────────────────────────────────────────────────────────────────

fn prompt_input(prompt: &str) -> Result<String> {
    print!("{prompt}: ");
    io::stdout().flush().ok();
    let mut line = String::new();
    let stdin = io::stdin();
    let mut handle = stdin.lock();
    handle.read_line(&mut line).context("ler stdin")?;
    Ok(line.trim().to_string())
}

async fn prompt_usk_token_until_valid(
    client: &reqwest::Client,
    api_url: &str,
) -> Result<(String, user_api::Me)> {
    if let Some(env_token) = std::env::var("OPENSYNC_WORKSPACE_TOKEN")
        .ok()
        .or_else(|| std::env::var("OPENSYNC_USK_TOKEN").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        if !env_token.starts_with("usk_") {
            eprintln!(
                "  ❌ OPENSYNC_WORKSPACE_TOKEN/OPENSYNC_USK_TOKEN deve comecar com usk_. Ignorando env."
            );
        } else {
            println!("\n  ⏳ A validar token (variavel OPENSYNC_WORKSPACE_TOKEN)…");
            match user_api::fetch_me(client, api_url, &env_token).await {
                Ok(me) => {
                    println!("  ✅ Autenticado como {}\n", me.email);
                    return Ok((env_token, me));
                }
                Err(e) => {
                    eprintln!("  ❌ Token em OPENSYNC_WORKSPACE_TOKEN invalido: {e}");
                    eprintln!("  A pedir o token de novo no assistente.\n");
                }
            }
        }
    }

    println!("\n  🔑 Passo 1 — token de workspace (usk_...)");
    println!("  Abre o painel, gera um token e cola aqui quando estiver pronto.");
    println!("  {SETTINGS_TOKENS_URL}\n");

    loop {
        let raw = prompt_input("Cole o token usk_")?;
        let token = raw.trim().to_string();
        if token.is_empty() {
            println!("  ⏳ A aguardar — gera o token no painel e cola aqui. (Ctrl+C para cancelar)\n");
            continue;
        }
        if !token.starts_with("usk_") {
            eprintln!("  ❌ O token tem de comecar com usk_. Tenta de novo.\n");
            continue;
        }
        println!("\n  ⏳ A validar o token com a API...");
        match user_api::fetch_me(client, api_url, &token).await {
            Ok(me) => {
                println!("  ✅ Autenticado como {}\n", me.email);
                return Ok((token, me));
            }
            Err(e) => {
                if let Some(http) = e.downcast_ref::<sync_core::api::HttpError>() {
                    if http.status == 401 || http.status == 403 {
                        eprintln!(
                            "  ❌ Token invalido ou revogado. Gera um novo em Definicoes → Tokens de acesso e cola outra vez.\n"
                        );
                        continue;
                    }
                }
                eprintln!("  ❌ Erro de rede/API: {e}");
                eprintln!("  Verifica a ligacao e tenta de novo.\n");
                continue;
            }
        }
    }
}

