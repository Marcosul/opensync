#!/usr/bin/env node
/**
 * Menu de manutenção Prisma (roda no contexto de @opensync/api).
 * Na raiz: pnpm prisma
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const apiEnvPath = join(rootDir, "apps", "api", ".env");

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

function log(msg, c = "cyan") {
  console.log(`${colors[c]}${msg}${colors.reset}`);
}

function loadEnvFromFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

/** Supabase: pooler 6543 costuma travar migrate; DIRECT_URL (5432) é o recomendado. */
function preferDirectDatabaseUrl() {
  const direct = process.env.DIRECT_URL?.trim();
  if (direct) {
    process.env.DATABASE_URL = direct;
  }
}

function runPrisma(args, { useDirectUrl = false } = {}) {
  loadEnvFromFile(apiEnvPath);
  if (useDirectUrl) {
    preferDirectDatabaseUrl();
  }

  const env = { ...process.env };
  const result = spawnSync(
    "pnpm",
    ["--filter", "@opensync/api", "exec", "prisma", ...args],
    {
      cwd: rootDir,
      stdio: "inherit",
      env,
      shell: false,
    },
  );

  if (result.status !== 0) {
    log(`\nComando terminou com código ${result.status ?? "?"}.`, "yellow");
  }
  return result.status ?? 1;
}

const MENU = `
${colors.green}Prisma — manutenção (@opensync/api)${colors.reset}
${colors.dim}Carrega apps/api/.env (sem sobrescrever variáveis já definidas no shell).${colors.reset}

  ${colors.cyan}1${colors.reset}  generate          — gera o Prisma Client
  ${colors.cyan}2${colors.reset}  migrate dev       — criar/aplicar migrações (desenvolvimento)
  ${colors.cyan}3${colors.reset}  migrate deploy    — aplicar migrações pendentes (usa DIRECT_URL se existir)
  ${colors.cyan}4${colors.reset}  migrate status    — estado das migrações (usa DIRECT_URL se existir)
  ${colors.cyan}5${colors.reset}  db push           — sincronizar schema sem migração (usa DIRECT_URL se existir)
  ${colors.cyan}6${colors.reset}  studio            — abre o Prisma Studio (usa DIRECT_URL se existir)
  ${colors.cyan}7${colors.reset}  format            — formata os ficheiros Prisma
  ${colors.cyan}8${colors.reset}  validate          — valida schema e migrações
  ${colors.cyan}9${colors.reset}  db pull           — introspect → atualiza schema a partir da BD (usa DIRECT_URL se existir)
  ${colors.cyan}0${colors.reset}  sair
`;

async function main() {
  if (!existsSync(join(rootDir, "apps", "api", "package.json"))) {
    log("apps/api não encontrado.", "yellow");
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      console.log(MENU);
      const raw = (await rl.question(`${colors.green}Opção [0-9]: ${colors.reset}`)).trim();

      switch (raw) {
        case "1":
          runPrisma(["generate"]);
          break;
        case "2":
          runPrisma(["migrate", "dev"], { useDirectUrl: true });
          break;
        case "3":
          runPrisma(["migrate", "deploy"], { useDirectUrl: true });
          break;
        case "4":
          runPrisma(["migrate", "status"], { useDirectUrl: true });
          break;
        case "5":
          runPrisma(["db", "push"], { useDirectUrl: true });
          break;
        case "6":
          runPrisma(["studio"], { useDirectUrl: true });
          break;
        case "7":
          runPrisma(["format"]);
          break;
        case "8":
          runPrisma(["validate"]);
          break;
        case "9":
          runPrisma(["db", "pull"], { useDirectUrl: true });
          break;
        case "0":
        case "":
          log("Até logo.", "green");
          return;
        default:
          log("Opção inválida.", "yellow");
      }

      await rl.question(`\n${colors.dim}Enter para continuar...${colors.reset}`);
      console.log("\n");
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
