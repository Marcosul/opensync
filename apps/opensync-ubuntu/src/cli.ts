#!/usr/bin/env node
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  loadConfig,
  loadToken,
  saveConfig,
  saveToken,
  type AgentConfig,
  defaultConfigPath,
  tokenPath,
  sqlitePath,
} from "./config";
import { runAgent } from "./engine";
import * as api from "./api";
import * as db from "./db";

async function ask(rl: readline.Interface, q: string, def?: string): Promise<string> {
  const hint = def !== undefined ? ` [${def}]` : "";
  const a = (await rl.question(`${q}${hint}: `)).trim();
  return a || (def ?? "");
}

async function cmdInit(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    const API_URL = "https://api.opensync.space/api";

    console.log("OpenSync Ubuntu — sincroniza qualquer pasta com um vault OpenSync");
    console.log("──────────────────────────────────────────────────────────────────\n");

    // ── Passo 1: Email ────────────────────────────────────────────────────────
    const email = await ask(rl, "E-mail da conta OpenSync");
    if (!email || !email.includes("@")) {
      console.error("Erro: e-mail invalido.");
      process.exit(1);
    }

    // ── Passo 2: Token do workspace (usk_...) ─────────────────────────────────
    console.log("\n  Nao tem um token? Gere em:");
    console.log("  https://opensync.space/settings?section=access-tokens\n");
    const uskToken = await ask(rl, "Token de acesso (usk_...)");
    if (!uskToken.startsWith("usk_")) {
      console.error("Erro: token invalido. Deve comecar com usk_");
      process.exit(1);
    }

    // ── Passo 3: Autenticar ───────────────────────────────────────────────────
    console.log("\nAutenticando...");
    let confirmedEmail: string;
    try {
      const me = await api.fetchMe(API_URL, uskToken);
      confirmedEmail = me.email;
      if (confirmedEmail.toLowerCase() !== email.toLowerCase()) {
        console.error(`Erro: token pertence a outra conta (${confirmedEmail}).`);
        process.exit(1);
      }
      console.log(`✓ Autenticado como ${confirmedEmail}`);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 401 || err?.status === 403) {
        console.error("Erro: token invalido ou revogado.");
        console.error("  Gere um novo em: https://opensync.space/settings?section=access-tokens");
        process.exit(1);
      }
      console.error("Erro ao conectar com a API:", err?.message ?? String(e));
      process.exit(1);
    }

    // ── Passo 4: Listar vaults existentes ─────────────────────────────────────
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

    // ── Passo 5: Pasta local ──────────────────────────────────────────────────
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

    // ── Passo 6: Gerar sync token (osk_...) ──────────────────────────────────
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

    // ── Passo 7: Salvar config ────────────────────────────────────────────────
    const poll = await ask(rl, "Intervalo de poll em segundos", "20");

    const cfg: AgentConfig = {
      apiUrl: API_URL,
      vaultId,
      syncDir,
      pollIntervalSeconds: Math.max(5, parseInt(poll, 10) || 20),
      ignore: [".git", "node_modules", ".cache", ".DS_Store", "*.tmp", "*.swp"],
      maxFileSizeBytes: 1048576,
    };

    await fs.mkdir(syncDir, { recursive: true });
    saveConfig(cfg);
    saveToken(syncToken);

    console.log("\n✓ Configuracao salva:");
    console.log("  vault:   ", vaultName);
    console.log("  pasta:   ", syncDir);
    console.log("  config:  ", defaultConfigPath());

    // ── Passo 8: Ativar systemd ───────────────────────────────────────────────
    const activate = await ask(rl, "\nAtivar e iniciar servico systemd agora? (s/n)", "s");
    if (activate.toLowerCase() === "s" || activate.toLowerCase() === "sim") {
      spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
      spawnSync("systemctl", ["--user", "enable", "opensync-ubuntu"], { stdio: "inherit" });
      const start = spawnSync("systemctl", ["--user", "start", "opensync-ubuntu"], { stdio: "inherit" });

      if (start.status === 0) {
        console.log("\n✓ Servico opensync-ubuntu iniciado.");
        console.log("  Logs:   journalctl --user -u opensync-ubuntu -f");
        console.log("  Status: opensync-ubuntu status");
      } else {
        console.log("\nNao foi possivel iniciar o servico. Comandos manuais:");
        console.log("  systemctl --user daemon-reload");
        console.log("  systemctl --user enable opensync-ubuntu");
        console.log("  systemctl --user start opensync-ubuntu");
      }
    } else {
      console.log("\nPara iniciar manualmente:");
      console.log("  opensync-ubuntu run");
      console.log("Ou como servico em segundo plano:");
      console.log("  systemctl --user enable --now opensync-ubuntu");
    }
  } finally {
    rl.close();
  }
}

async function cmdRun(): Promise<void> {
  const cfg = loadConfig();
  const token = loadToken();
  await runAgent(cfg, token);
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

  console.log("OpenSync Ubuntu — status");
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
  if (cmd === "init") {
    await cmdInit();
    return;
  }
  if (cmd === "run" || cmd === "") {
    await cmdRun();
    return;
  }
  if (cmd === "status") {
    await cmdStatus();
    return;
  }
  console.error("Uso: opensync-ubuntu init | opensync-ubuntu run | opensync-ubuntu status");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
