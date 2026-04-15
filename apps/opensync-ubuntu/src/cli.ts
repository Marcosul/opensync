#!/usr/bin/env node
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as process from "node:process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as fsSync from "node:fs";
import { spawnSync } from "node:child_process";
import {
  loadConfig,
  loadToken,
  saveConfig,
  saveToken,
  type SyncConfig,
  defaultConfigPath,
  tokenPath,
  sqlitePath,
  DEFAULT_POLL_INTERVAL_SECONDS,
  normalizeAndPersistConfigPathsIfNeeded,
  resolveUserPath,
} from "./config";
import { runSync } from "./engine";
import * as api from "./api";
import * as db from "./db";

const DEFAULT_UPDATE_DEB_URL =
  "https://gpnxlfnjuxqhlsmxwfmc.supabase.co/storage/v1/object/public/installer/opensync-ubuntu_0.1.0_amd64.deb";

function cliVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, "..", "package.json");
    const raw = fsSync.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function runCommand(cmd: string, args: string[]): void {
  const res = spawnSync(cmd, args, { stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} falhou (exit=${res.status ?? "?"})`);
  }
}

async function cmdUpdate(): Promise<void> {
  const debUrl = (process.env.OPENSYNC_UPDATE_DEB_URL ?? DEFAULT_UPDATE_DEB_URL).trim();
  const tmpDebPath = path.join(
    process.env.TMPDIR ?? "/tmp",
    `opensync-ubuntu-update-${Date.now()}.deb`,
  );

  console.log("OpenSync — update");
  console.log(`  pacote: ${debUrl}`);
  console.log("  baixando...");

  const response = await fetch(debUrl);
  if (!response.ok) {
    throw new Error(`falha ao baixar pacote (${response.status})`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(tmpDebPath, data);
  console.log(`  arquivo: ${tmpDebPath}`);

  try {
    console.log("  instalando .deb...");
    const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
    if (isRoot) {
      runCommand("dpkg", ["-i", tmpDebPath]);
    } else {
      runCommand("sudo", ["dpkg", "-i", tmpDebPath]);
    }

    console.log("  reiniciando servico local...");
    runCommand("systemctl", ["--user", "daemon-reload"]);
    runCommand("systemctl", ["--user", "restart", "opensync-ubuntu"]);
    runCommand("systemctl", ["--user", "status", "opensync-ubuntu", "--no-pager", "--lines=3"]);
    console.log("\n✅ OpenSync atualizado e servico reiniciado.");
  } finally {
    await fs.rm(tmpDebPath, { force: true });
  }
}

async function ask(rl: readline.Interface, q: string, def?: string): Promise<string> {
  const hint = def !== undefined ? ` [${def}]` : "";
  const a = (await rl.question(`${q}${hint}: `)).trim();
  return a || (def ?? "");
}

/** Pede o token usk_ e volta a pedir ate a API aceitar (Ctrl+C para sair). */
async function promptUskTokenUntilValid(
  rl: readline.Interface,
  apiUrl: string,
): Promise<{ uskToken: string; email: string }> {
  const readEnvToken = (): string =>
    (process.env.OPENSYNC_WORKSPACE_TOKEN ?? process.env.OPENSYNC_USK_TOKEN ?? "").trim();

  let fromEnv = readEnvToken();
  if (fromEnv) {
    if (!fromEnv.startsWith("usk_")) {
      console.error(
        "  ❌ OPENSYNC_WORKSPACE_TOKEN / OPENSYNC_USK_TOKEN deve comecar com usk_. Ignorando env.\n",
      );
      delete process.env.OPENSYNC_WORKSPACE_TOKEN;
      delete process.env.OPENSYNC_USK_TOKEN;
    } else {
      try {
        console.log("\n  ⏳ A validar token (variavel OPENSYNC_WORKSPACE_TOKEN)…");
        const me = await api.fetchMe(apiUrl, fromEnv);
        console.log(`  ✅ Autenticado como ${me.email}\n`);
        return { uskToken: fromEnv, email: me.email };
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        console.error(
          "  ❌ Token em OPENSYNC_WORKSPACE_TOKEN invalido ou revogado:",
          err?.message ?? String(e),
        );
        console.error("  A pedir o token de novo no assistente.\n");
        delete process.env.OPENSYNC_WORKSPACE_TOKEN;
        delete process.env.OPENSYNC_USK_TOKEN;
      }
    }
  }

  console.log("\n  🔑 Passo 1 — token de workspace (usk_...)");
  console.log("  Abre o painel, gera um token e cola aqui quando estiver pronto.");
  console.log("  https://opensync.space/settings?section=access-tokens\n");

  for (;;) {
    const raw = await ask(rl, "Cole o token usk_");
    const uskToken = raw.trim();
    if (!uskToken) {
      console.log(
        "  ⏳ A aguardar — gera o token no painel, cola aqui e carrega Enter. (Ctrl+C para cancelar)\n",
      );
      continue;
    }
    if (!uskToken.startsWith("usk_")) {
      console.error("  ❌ O token tem de comecar com usk_. Tenta de novo.\n");
      continue;
    }
    try {
      console.log("\n  ⏳ A validar o token com a API...");
      const me = await api.fetchMe(apiUrl, uskToken);
      console.log(`  ✅ Autenticado como ${me.email}\n`);
      return { uskToken, email: me.email };
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 401 || err?.status === 403) {
        console.error(
          "  ❌ Token invalido ou revogado. Gera um novo em Definicoes → Tokens de acesso e cola outra vez.\n",
        );
        continue;
      }
      console.error("  ❌ Erro de rede/API:", err?.message ?? String(e));
      console.error("  Verifica a ligacao e tenta de novo.\n");
      continue;
    }
  }
}

function printHelp(): void {
  console.log(`OpenSync CLI

Uso:
  opensync <comando>

Comandos:
  help        Mostra esta ajuda
  version     Mostra a versao instalada do CLI
  status      Mostra o status local (cursor, arquivos e conflitos)
  update      Atualiza para a ultima versao e reinicia o servico local
  reinstall   Reinstala o pacote atual e reinicia o servico local
  uninstall   Remove o servico local (mantem configuracao local)
  sync        Inicia a sincronizacao (alias de run)
  restart     Reinicia o servico local opensync-ubuntu
  stop        Para o servico local opensync-ubuntu
  list-sync   Mostra vault e diretorio local atualmente sincronizados
  list-vault  Lista os vaults da conta usando token usk_
  set-sync-dir <diretorio>
              Troca o diretorio local de sincronizacao do vault atual
`);
}

async function cmdRestart(): Promise<void> {
  runCommand("systemctl", ["--user", "daemon-reload"]);
  runCommand("systemctl", ["--user", "restart", "opensync-ubuntu"]);
  runCommand("systemctl", ["--user", "status", "opensync-ubuntu", "--no-pager", "--lines=3"]);
  console.log("✅ Servico reiniciado.");
}

async function cmdStop(): Promise<void> {
  runCommand("systemctl", ["--user", "stop", "opensync-ubuntu"]);
  runCommand("systemctl", ["--user", "status", "opensync-ubuntu", "--no-pager", "--lines=3"]);
  console.log("✅ Servico parado.");
}

async function cmdUninstall(): Promise<void> {
  console.log("OpenSync — uninstall");
  runCommand("systemctl", ["--user", "stop", "opensync-ubuntu"]);
  runCommand("systemctl", ["--user", "disable", "opensync-ubuntu"]);
  runCommand("systemctl", ["--user", "daemon-reload"]);
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (isRoot) {
    runCommand("dpkg", ["-r", "opensync-ubuntu"]);
  } else {
    runCommand("sudo", ["dpkg", "-r", "opensync-ubuntu"]);
  }
  console.log("✅ OpenSync removido do sistema.");
}

async function cmdReinstall(): Promise<void> {
  console.log("OpenSync — reinstall");
  await cmdUpdate();
}

async function cmdListVault(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    const API_URL = "https://api.opensync.space/api";
    const { uskToken, email } = await promptUskTokenUntilValid(rl, API_URL);
    const vaults = await api.fetchUserVaults(API_URL, uskToken);
    console.log(`\nVaults de ${email}:`);
    if (vaults.length === 0) {
      console.log("  (nenhum vault)");
      return;
    }
    for (const [i, v] of vaults.entries()) {
      console.log(`  ${i + 1}. ${v.name} [${v.id}] — workspace: ${v.workspaceName}`);
    }
  } finally {
    rl.close();
  }
}

async function cmdVersion(): Promise<void> {
  console.log(`opensync v${cliVersion()}`);
}

async function cmdListSync(): Promise<void> {
  const cfg = loadConfig();
  console.log("OpenSync — sincronizacao local");
  console.log("  vaultId: ", cfg.vaultId);
  console.log("  syncDir: ", cfg.syncDir);
  console.log("  apiUrl:  ", cfg.apiUrl);
  console.log("  poll:    ", `${cfg.pollIntervalSeconds}s`);
}

async function cmdSetSyncDir(argPath?: string): Promise<void> {
  const cfg = loadConfig();
  const rl = readline.createInterface({ input, output });
  try {
    const nextRaw = (argPath?.trim() || (await ask(rl, "Novo diretorio de sincronizacao", cfg.syncDir))).trim();
    if (!nextRaw) {
      throw new Error("diretorio invalido");
    }
    const nextDir = resolveUserPath(nextRaw);
    await fs.mkdir(nextDir, { recursive: true });
    cfg.syncDir = nextDir;
    saveConfig(cfg);
    console.log("✅ Diretorio de sincronizacao atualizado.");
    console.log("  vaultId: ", cfg.vaultId);
    console.log("  syncDir: ", cfg.syncDir);
    console.log("  Dica: execute `opensync restart` para aplicar no servico em background.");
  } finally {
    rl.close();
  }
}

async function cmdInit(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    const API_URL = "https://api.opensync.space/api";

    console.log("OpenSync — sincroniza qualquer pasta com um vault OpenSync");
    console.log("──────────────────────────────────────────────────────────────────\n");
    console.log("  Nao tem conta? Crie uma em: https://opensync.space/login");

    const { uskToken } = await promptUskTokenUntilValid(rl, API_URL);

    // ── Passo 2: Listar vaults existentes ─────────────────────────────────────
    console.log("\nBuscando seus vaults...");
    let vaults: api.UserVault[] = [];
    try {
      vaults = await api.fetchUserVaults(API_URL, uskToken);
    } catch {
      console.warn("Aviso: nao foi possivel listar vaults.");
    }

    let vaultId: string;
    let vaultName: string;

    if (vaults.length === 0) {
      console.log("\nVoce nao possui vaults. Crie seu primeiro vault:");
      vaultName = await ask(rl, "Nome do vault", "Meu Vault");
      if (!vaultName) {
        console.error("Erro: nome do vault obrigatorio.");
        process.exit(1);
      }
      console.log("Criando vault...");
      try {
        const created = await api.createUserVault(API_URL, uskToken, vaultName);
        vaultId = created.id;
        console.log(`✓ Vault "${vaultName}" criado.`);
      } catch (e: unknown) {
        const err = e as { message?: string };
        console.error("Erro ao criar vault:", err?.message ?? String(e));
        process.exit(1);
      }
    } else {
      console.log(`\nSeus vaults:`);
      vaults.forEach((v, i) => {
        console.log(`  ${i + 1}. ${v.name}  [${v.workspaceName}]`);
      });
      console.log(`  ${vaults.length + 1}. + Criar novo vault`);

      const choice = await ask(rl, "\nEscolha (numero)", "1");
      const idx = parseInt(choice, 10) - 1;

      if (idx === vaults.length) {
        vaultName = await ask(rl, "Nome do novo vault");
        if (!vaultName) {
          console.error("Erro: nome do vault obrigatorio.");
          process.exit(1);
        }
        console.log("Criando vault...");
        try {
          const created = await api.createUserVault(API_URL, uskToken, vaultName);
          vaultId = created.id;
          console.log(`✓ Vault "${vaultName}" criado.`);
        } catch (e: unknown) {
          const err = e as { message?: string };
          console.error("Erro ao criar vault:", err?.message ?? String(e));
          process.exit(1);
        }
      } else if (idx >= 0 && idx < vaults.length) {
        vaultId = vaults[idx].id;
        vaultName = vaults[idx].name;
        console.log(`✓ Vault selecionado: ${vaultName}`);
      } else {
        console.error("Escolha invalida.");
        process.exit(1);
      }
    }

    // ── Passo 3: Pasta local ──────────────────────────────────────────────────
    const homeDir = process.env.HOME ?? "/home";
    const syncDir = await ask(
      rl,
      "\nPasta local a sincronizar",
      `${homeDir}/Documents/${vaultName.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    );
    if (!syncDir) {
      console.error("Erro: pasta obrigatoria.");
      process.exit(1);
    }
    const resolvedSyncDir = resolveUserPath(syncDir);

    // ── Passo 4: Gerar sync token (osk_...) ──────────────────────────────────
    console.log("\nGerando token de sync...");
    let syncToken: string;
    try {
      const result = await api.createSyncToken(API_URL, uskToken, vaultId);
      syncToken = result.token;
      console.log("✓ Token de sync gerado.");
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error("Erro ao gerar token de sync:", err?.message ?? String(e));
      process.exit(1);
    }

    // ── Passo 5: Salvar config ────────────────────────────────────────────────
    const cfg: SyncConfig = {
      apiUrl: API_URL,
      vaultId,
      syncDir: resolvedSyncDir,
      pollIntervalSeconds: Math.max(5, DEFAULT_POLL_INTERVAL_SECONDS),
      ignore: [".git", "node_modules", ".cache", ".DS_Store", "*.tmp", "*.swp"],
      maxFileSizeBytes: 1048576,
    };

    await fs.mkdir(resolvedSyncDir, { recursive: true });
    saveConfig(cfg);
    saveToken(syncToken);

    console.log("\n✓ Configuracao salva:");
    console.log("  vault:   ", vaultName);
    console.log("  pasta:   ", resolvedSyncDir);
    console.log("  config:  ", defaultConfigPath());

    // ── Passo 6: Ativar systemd (sempre por defeito) ────────────────────────────
    console.log("\nA activar e reiniciar o servico systemd (utilizador)…");
    spawnSync("loginctl", ["enable-linger", process.env.USER ?? ""], { stdio: "inherit" });
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
    const enable = spawnSync("systemctl", ["--user", "enable", "opensync-ubuntu"], { stdio: "inherit" });
    const restart = spawnSync("systemctl", ["--user", "restart", "opensync-ubuntu"], { stdio: "inherit" });

    if (enable.status === 0 && restart.status === 0) {
      console.log("\n✓ Servico opensync-ubuntu reiniciado e habilitado no boot.");
      console.log("  O poll remoto corre em background (nao depende de abrir a pasta no gestor de ficheiros).");
      console.log("  Com loginctl enable-linger (acima), o sync continua com o PC ligado mesmo sem login na sessao.");
      console.log("  Logs:   journalctl --user -u opensync-ubuntu -f");
      console.log("  Status: opensync status");
    } else {
      console.log("\nNao foi possivel reiniciar o servico. Comandos manuais:");
      console.log("  loginctl enable-linger $USER");
      console.log("  systemctl --user daemon-reload");
      console.log("  systemctl --user enable opensync-ubuntu");
      console.log("  systemctl --user restart opensync-ubuntu");
    }

    console.log("\n──────────────────────────────────────────────────────────────────");
    console.log("  ✅ Instalado com sucesso! — OpenSync esta pronto a sincronizar.");
    console.log("──────────────────────────────────────────────────────────────────\n");
  } finally {
    rl.close();
  }
}

async function cmdRun(): Promise<void> {
  const fixed = normalizeAndPersistConfigPathsIfNeeded();
  if (fixed) {
    console.log("🔧 Config antiga detetada e corrigida: caminho de sync normalizado.");
  }
  const cfg = loadConfig();
  const token = loadToken();
  await runSync(cfg, token);
}

async function cmdStatus(): Promise<void> {
  const cfg = loadConfig();
  const database = db.openDb(cfg);

  const cursor = db.getRemoteCursor(database);
  const countRow = database
    .prepare("SELECT count(*) as n FROM files_state WHERE is_deleted=0")
    .get() as { n: number };
  const conflictRows = database
    .prepare("SELECT path FROM files_state WHERE path LIKE '%(conflict%' AND is_deleted=0")
    .all() as { path: string }[];

  console.log("OpenSync — status");
  console.log("  syncDir:   ", cfg.syncDir);
  console.log("  vault:     ", cfg.vaultId);
  console.log("  apiUrl:    ", cfg.apiUrl);
  console.log("  cursor:    ", cursor);
  console.log("  arquivos:  ", countRow.n);
  console.log("  poll:      ", `${cfg.pollIntervalSeconds}s`);
  console.log("  db:        ", sqlitePath(cfg.vaultId));

  if (conflictRows.length > 0) {
    console.log(`\n  Conflitos pendentes (${conflictRows.length}):`);
    for (const r of conflictRows) {
      console.log("    -", r.path);
    }
  } else {
    console.log("  conflitos: nenhum");
  }

  database.close();
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "run";
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }
  if (cmd === "init") {
    await cmdInit();
    return;
  }
  if (cmd === "run" || cmd === "" || cmd === "sync") {
    await cmdRun();
    return;
  }
  if (cmd === "version" || cmd === "-v" || cmd === "--version") {
    await cmdVersion();
    return;
  }
  if (cmd === "status") {
    await cmdStatus();
    return;
  }
  if (cmd === "update") {
    await cmdUpdate();
    return;
  }
  if (cmd === "restart") {
    await cmdRestart();
    return;
  }
  if (cmd === "stop") {
    await cmdStop();
    return;
  }
  if (cmd === "uninstall") {
    await cmdUninstall();
    return;
  }
  if (cmd === "reinstall") {
    await cmdReinstall();
    return;
  }
  if (cmd === "list-vault") {
    await cmdListVault();
    return;
  }
  if (cmd === "list-sync") {
    await cmdListSync();
    return;
  }
  if (cmd === "set-sync-dir") {
    await cmdSetSyncDir(process.argv[3]);
    return;
  }
  printHelp();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
