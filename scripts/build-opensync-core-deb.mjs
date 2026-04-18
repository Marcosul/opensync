#!/usr/bin/env node
/**
 * Gera o pacote Debian do core Rust (apps/core) e envia para Supabase Storage.
 *
 *   pnpm core:deploy
 *   pnpm core:deploy -- 0.2.0
 *
 * Pré-requisitos no host:
 *   - rustup + cargo (`~/.cargo/bin/cargo` no PATH)
 *   - cargo-deb       (instalar com: cargo install cargo-deb --locked)
 *   - dpkg-deb        (Linux)
 *
 * Env (.env, .env.local, apps/web/.env, apps/api/.env, ...):
 *   - SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY (service_role do dashboard — não anon/publishable)
 *   - SKIP_DEB_UPLOAD=1 → só gera o .deb, sem upload
 *
 * Resultado:
 *   - target/debian/opensync_<X.Y.Z>_amd64.deb
 *   - upload Supabase: bucket `installer` → opensync_<X.Y.Z>_amd64.deb (overwrite)
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  compareSemver,
  incrementPatch,
  isValidSemver,
  uploadDebToSupabase,
} from "./lib/supabase-deb-upload.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "opensync";
const ARCH = "amd64";

function resolveDebDir() {
  try {
    const out = execSync("cargo metadata --format-version 1 --no-deps", {
      cwd: root,
      env: process.env,
      encoding: "utf8",
    });
    const meta = JSON.parse(out);
    if (meta?.target_directory) return join(meta.target_directory, "debian");
  } catch {
    /* fallback abaixo */
  }
  return join(root, "target", "debian");
}

function ensureCargoOnPath() {
  const home = process.env.HOME ?? "";
  const cargoBin = home ? join(home, ".cargo", "bin") : "";
  const sep = process.platform === "win32" ? ";" : ":";
  if (cargoBin && !String(process.env.PATH ?? "").split(sep).includes(cargoBin)) {
    process.env.PATH = `${cargoBin}${sep}${process.env.PATH ?? ""}`;
  }
}

function which(cmd) {
  const res = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  return res.status === 0 ? String(res.stdout).split(/\r?\n/)[0].trim() : "";
}

function ensureDeps() {
  ensureCargoOnPath();
  const cargo = which("cargo");
  if (!cargo) {
    console.error("\n❌ `cargo` não encontrado no PATH.");
    console.error("   Instala via rustup: https://www.rust-lang.org/tools/install");
    console.error("   Depois: source ~/.cargo/env && cargo --version\n");
    process.exit(1);
  }
  const cargoDeb = which("cargo-deb");
  if (!cargoDeb) {
    console.error("\n❌ `cargo-deb` não encontrado no PATH.");
    console.error("   Instala com: cargo install cargo-deb --locked\n");
    process.exit(1);
  }
  if (!which("dpkg-deb")) {
    console.warn(
      "⚠️  `dpkg-deb` não encontrado — `cargo-deb` provavelmente vai falhar fora de Linux.",
    );
  }
}

function readCargoTomlVersion() {
  const cargoToml = join(root, "apps", "core", "Cargo.toml");
  const text = readFileSync(cargoToml, "utf8");
  const match = text.match(/^\s*version\s*=\s*"(\d+\.\d+\.\d+)"\s*$/m);
  return match ? match[1] : "0.1.0";
}

function suggestVersion() {
  const cargoVersion = readCargoTomlVersion();
  const debDir = resolveDebDir();
  if (!existsSync(debDir)) return cargoVersion;
  let highest = null;
  for (const name of readdirSync(debDir)) {
    const m = name.match(
      new RegExp(`^${PACKAGE_NAME}_(\\d+\\.\\d+\\.\\d+)_${ARCH}\\.deb$`),
    );
    if (!m) continue;
    if (!highest || compareSemver(m[1], highest) > 0) highest = m[1];
  }
  return highest ? incrementPatch(highest) : cargoVersion;
}

/** @param {string} defaultVersion */
async function askVersionFromConsole(defaultVersion) {
  const rl = createInterface({ input, output });
  try {
    console.log("\n📦 Deploy opensync (core, Rust)");
    console.log(`   Sugestão de versão: ${defaultVersion}`);
    const typed = await rl.question(
      `   Versão para gerar/publicar [${defaultVersion}]: `,
    );
    const selected = typed.trim() || defaultVersion;
    if (!isValidSemver(selected)) {
      console.error(`\n❌ Versão inválida: "${selected}". Use formato X.Y.Z\n`);
      process.exit(1);
    }
    const confirm = await rl.question(
      `   Confirmar geração e upload da versão ${selected}? (Y/n): `,
    );
    if ((confirm.trim() || "y").toLowerCase() === "n") {
      console.log("\n⏹️  Operação cancelada pelo usuário.\n");
      process.exit(0);
    }
    return selected;
  } finally {
    rl.close();
  }
}

function syncCargoTomlVersion(targetVersion) {
  const cargoTomlPath = join(root, "apps", "core", "Cargo.toml");
  const text = readFileSync(cargoTomlPath, "utf8");
  const updated = text.replace(
    /^(\s*version\s*=\s*)"(\d+\.\d+\.\d+)"\s*$/m,
    `$1"${targetVersion}"`,
  );
  if (updated !== text) {
    writeFileSync(cargoTomlPath, updated);
    console.log(`   • apps/core/Cargo.toml → version = "${targetVersion}"`);
  }
}

function runStep(label, cmd, args) {
  console.log(`\n🔧 ${label}`);
  console.log(`   $ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: root, env: process.env });
  if (res.status !== 0) {
    console.error(`\n❌ ${label} falhou (exit=${res.status ?? "?"})\n`);
    process.exit(res.status ?? 1);
  }
}

async function main() {
  ensureDeps();

  const cliVersion = (process.argv[2] ?? "").trim();
  const suggested = suggestVersion();
  const chosen = cliVersion || (await askVersionFromConsole(suggested));
  if (!isValidSemver(chosen)) {
    console.error(`\n❌ Versão inválida: "${chosen}". Use formato X.Y.Z\n`);
    process.exit(1);
  }

  console.log(`\n📌 Versão alvo: ${chosen}`);
  syncCargoTomlVersion(chosen);

  runStep(
    "cargo build --release -p opensync-core",
    "cargo",
    ["build", "--release", "-p", "opensync-core"],
  );

  runStep(
    "cargo deb -p opensync-core --no-build",
    "cargo",
    ["deb", "-p", "opensync-core", "--no-build"],
  );

  const debName = `${PACKAGE_NAME}_${chosen}_${ARCH}.deb`;
  const debDir = resolveDebDir();
  const debPath = join(debDir, debName);
  if (!existsSync(debPath)) {
    console.error(`\n❌ Pacote esperado não encontrado: ${debPath}`);
    console.error("   (Verifica saída do cargo-deb acima.)\n");
    process.exit(1);
  }
  console.log(`\n📦 Pacote: ${debPath}`);

  try {
    const sha = execSync(`sha256sum "${debPath}"`, { encoding: "utf8" }).trim();
    console.log(`\n🔐 sha256: ${sha}`);
  } catch {
    /* noop */
  }

  await uploadDebToSupabase({
    root,
    debPath,
    objectName: debName,
  });

  console.log(`\n🎉 Pronto. Para instalar no VPS:`);
  console.log(`   curl -fsSL https://opensync.space/install/ubuntu | bash\n`);
}

await main();
