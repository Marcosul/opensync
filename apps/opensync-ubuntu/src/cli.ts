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
    console.log("OpenSync Ubuntu — sincroniza qualquer pasta com um vault OpenSync\n");
    const apiUrl = await ask(rl, "API URL", "https://api.opensync.space/api");
    const vaultId = await ask(rl, "Vault ID (UUID)");
    const syncDir = await ask(
      rl,
      "Caminho absoluto da pasta a sincronizar (ex: /home/voce/Documentos/Vault)",
    );
    const poll = await ask(rl, "Intervalo de poll em segundos", "20");
    const token = await ask(rl, "API key do agente (osk_...)");

    if (!vaultId || !syncDir || !token) {
      console.error("Erro: vaultId, syncDir e token sao obrigatorios.");
      process.exit(1);
    }

    const cfg: AgentConfig = {
      apiUrl: apiUrl.replace(/\/+$/, ""),
      vaultId,
      syncDir,
      pollIntervalSeconds: Math.max(5, parseInt(poll, 10) || 20),
      ignore: [".git", "node_modules", ".cache", ".DS_Store", "*.tmp", "*.swp"],
      maxFileSizeBytes: 1048576,
    };

    // Validar credenciais antes de salvar
    console.log("\nValidando credenciais...");
    try {
      await api.fetchChanges(cfg, token, "0");
      console.log("✓ Credenciais validadas.");
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 401 || err?.status === 403) {
        console.error("Erro: token invalido ou sem permissao para este vault. Verifique a API key.");
        process.exit(1);
      }
      if (err?.status === 404) {
        console.error("Erro: vault nao encontrado. Verifique o Vault ID.");
        process.exit(1);
      }
      console.warn("Aviso: nao foi possivel validar credenciais (problema de rede?). Salvando config assim mesmo.");
      console.warn("Detalhe:", err?.message ?? String(e));
    }

    await fs.mkdir(syncDir, { recursive: true });
    saveConfig(cfg);
    saveToken(token);

    console.log("\nConfig salva em:", defaultConfigPath());
    console.log("Token salvo em: ", tokenPath());

    // Oferecer ativar systemd automaticamente
    const activate = await ask(rl, "\nAtivar e iniciar servico systemd agora? (s/n)", "s");
    if (activate.toLowerCase() === "s" || activate.toLowerCase() === "sim") {
      spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
      spawnSync("systemctl", ["--user", "enable", "opensync-ubuntu"], { stdio: "inherit" });
      const start = spawnSync("systemctl", ["--user", "start", "opensync-ubuntu"], { stdio: "inherit" });

      if (start.status === 0) {
        console.log("\n✓ Servico opensync-ubuntu iniciado.");
        console.log("  Logs:   journalctl --user -u opensync-ubuntu -f");
        console.log("  Status: systemctl --user status opensync-ubuntu");
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
      console.log("  systemctl --user daemon-reload");
      console.log("  systemctl --user enable opensync-ubuntu");
      console.log("  systemctl --user start opensync-ubuntu");
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
