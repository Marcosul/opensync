#!/usr/bin/env node
/**
 * Gera apps/opensync-ubuntu/packaging/opensync-ubuntu_<versão>_amd64.deb
 * e envia para o bucket Supabase Storage `installer` (sobrescreve se existir).
 *
 * Versão: primeiro argumento CLI, senão `version` do package.json da raiz.
 * Uso: pnpm opensync-ubuntu:deploy
 *       pnpm opensync-ubuntu:deploy -- 0.2.0
 *
 * Env (ficheiros, por ordem; depois sobrepõe com variáveis do processo / export):
 *   .env, .env.local, apps/web/.env, apps/web/.env.local, apps/api/.env, apps/api/.env.local
 *   SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (service_role do dashboard — não anon/publishable)
 *   SKIP_DEB_UPLOAD=1 — só gera o .deb, sem upload
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER_BUCKET = "installer";
const DEB_FILENAME_REGEX = /^opensync-ubuntu_(\d+\.\d+\.\d+)_amd64\.deb$/;

/** @param {string} filePath */
function loadEnvFile(filePath) {
  try {
    let text = readFileSync(filePath, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    /** @type {Record<string, string>} */
    const out = {};
    for (const line of text.split("\n")) {
      let t = line.trim();
      if (!t || t.startsWith("#")) continue;
      if (t.startsWith("export ")) t = t.slice(7).trim();
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function mergedSupabaseEnv() {
  const paths = [
    join(root, ".env"),
    join(root, ".env.local"),
    join(root, "apps/web/.env"),
    join(root, "apps/web/.env.local"),
    join(root, "apps/api/.env"),
    join(root, "apps/api/.env.local"),
  ];
  /** @type {Record<string, string>} */
  const merged = {};
  for (const p of paths) Object.assign(merged, loadEnvFile(p));

  const normalize = (/** @type {string | undefined} */ v) =>
    String(v ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");

  const isPlaceholder = (/** @type {string} */ v) => {
    const value = v.toLowerCase();
    return (
      value.includes("your-project.supabase.co") ||
      value.includes("your-service-role-key") ||
      value.includes("replace-me") ||
      value.includes("changeme")
    );
  };

  /**
   * @param {Array<{ key: string; source: "process" | "env-file" }>} candidates
   */
  const pickBest = (candidates) => {
    /** @type {{ value: string; key: string; source: "process" | "env-file" } | null} */
    let firstNonEmpty = null;
    for (const candidate of candidates) {
      const raw = candidate.source === "process" ? process.env[candidate.key] : merged[candidate.key];
      const value = normalize(raw);
      if (!value) continue;
      if (!firstNonEmpty) firstNonEmpty = { ...candidate, value };
      if (!isPlaceholder(value)) {
        return { ...candidate, value, placeholderDetected: false };
      }
    }
    return firstNonEmpty ? { ...firstNonEmpty, placeholderDetected: true } : null;
  };

  const chosenUrl = pickBest([
    { key: "SUPABASE_URL", source: "process" },
    { key: "NEXT_PUBLIC_SUPABASE_URL", source: "process" },
    { key: "SUPABASE_URL", source: "env-file" },
    { key: "NEXT_PUBLIC_SUPABASE_URL", source: "env-file" },
  ]);

  const chosenServiceKey = pickBest([
    { key: "SUPABASE_SERVICE_ROLE_KEY", source: "process" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", source: "env-file" },
  ]);

  const supabaseUrl = String(chosenUrl?.value ?? "").replace(/\/+$/, "");
  const serviceKey = String(chosenServiceKey?.value ?? "");

  return {
    supabaseUrl,
    serviceKey,
    mergedPaths: paths,
    urlMeta: chosenUrl,
    serviceKeyMeta: chosenServiceKey,
  };
}

/**
 * @param {string} debPath
 * @param {string} version
 */
async function uploadDebToSupabase(debPath, version) {
  if (process.env.SKIP_DEB_UPLOAD === "1") {
    console.log("\n⏭️  SKIP_DEB_UPLOAD=1 — upload ao Supabase ignorado.\n");
    return;
  }

  const { supabaseUrl, serviceKey, mergedPaths, urlMeta, serviceKeyMeta } = mergedSupabaseEnv();
  if (!supabaseUrl || !serviceKey || urlMeta?.placeholderDetected || serviceKeyMeta?.placeholderDetected) {
    console.error("\n\x1b[31m❌ Upload Supabase: configuração inválida.\x1b[0m");
    if (!supabaseUrl) {
      console.error("   • Falta URL: SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL");
    } else if (urlMeta?.placeholderDetected) {
      console.error(
        `   • URL inválida em ${urlMeta.source === "process" ? "variável exportada" : "ficheiro .env"} (${urlMeta.key}): ${supabaseUrl}`,
      );
      console.error("     Use a URL real do projeto Supabase, não um placeholder (ex.: your-project.supabase.co).");
    }
    if (!serviceKey) {
      console.error(
        "   • Falta SUPABASE_SERVICE_ROLE_KEY (secret service_role em Supabase → Settings → API).",
      );
      console.error("     Não serve anon nem publishable; cola em apps/api/.env ou export no terminal.");
    } else if (serviceKeyMeta?.placeholderDetected) {
      console.error(
        `   • SUPABASE_SERVICE_ROLE_KEY inválida em ${serviceKeyMeta.source === "process" ? "variável exportada" : "ficheiro .env"} (${serviceKeyMeta.key}).`,
      );
      console.error("     Substitua `your-service-role-key` pelo valor real de service_role.");
    }
    console.error("\n   Ficheiros lidos (se existirem):");
    for (const p of mergedPaths) {
      const rel = p.startsWith(root) ? p.slice(root.length + 1) : p;
      console.error(`     - ${rel}`);
    }
    console.error("\n   Variáveis exportadas no shell (ex.: export SUPABASE_...) têm prioridade sobre .env.");
    console.error("   Ou: SKIP_DEB_UPLOAD=1 pnpm opensync-ubuntu:deploy  → só gera o .deb.\n");
    process.exit(1);
  }

  if (!existsSync(debPath)) {
    console.error(`\n❌ Ficheiro .deb não encontrado: ${debPath}\n`);
    process.exit(1);
  }

  const filename = `opensync-ubuntu_${version}_amd64.deb`;
  const body = readFileSync(debPath);
  const objectPath = `${INSTALLER_BUCKET}/${filename}`;
  const objectUrl = `${supabaseUrl}/storage/v1/object/${objectPath}`;

  const uploadHeaders = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/vnd.debian.binary-package",
    /** API Storage: sobrescrever objecto existente (query ?upsert=true sozinha não basta). */
    "x-upsert": "true",
  };

  console.log("\n📤 A enviar para Supabase Storage…");
  console.log(`   bucket: ${INSTALLER_BUCKET}`);
  console.log(`   object: ${filename} (${(body.length / (1024 * 1024)).toFixed(2)} MiB, overwrite)`);

  let res = await fetch(objectUrl, { method: "POST", headers: uploadHeaders, body });
  let text = await res.text().catch(() => "");

  const isDuplicate =
    !res.ok &&
    (res.status === 409 ||
      text.includes("Duplicate") ||
      text.includes('"statusCode":"409"') ||
      text.includes("already exists"));

  if (isDuplicate) {
    console.log("   ↪️  409 Duplicate: a remover o ficheiro antigo e a voltar a enviar…");
    const del = await fetch(objectUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    const delText = await del.text().catch(() => "");
    if (!del.ok && del.status !== 404) {
      console.error(`\n❌ DELETE antes do re-upload falhou (${del.status}):`, delText || del.statusText, "\n");
      process.exit(1);
    }
    res = await fetch(objectUrl, { method: "POST", headers: uploadHeaders, body });
    text = await res.text().catch(() => "");
  }

  if (!res.ok) {
    console.error(`\n❌ Upload falhou (${res.status}):`, text || res.statusText, "\n");
    process.exit(1);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${objectPath}`;
  console.log("\n✅ Upload concluído (object actualizado se já existia).");
  console.log(`   URL pública: ${publicUrl}\n`);
}

/**
 * @param {string} value
 */
function isValidSemver(value) {
  return /^\d+\.\d+\.\d+$/.test(value);
}

/**
 * @param {string} a
 * @param {string} b
 */
function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * @param {string} value
 */
function incrementPatch(value) {
  const [major, minor, patch] = value.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function getHighestDebVersion() {
  const packagingDir = join(root, "apps/opensync-ubuntu/packaging");
  /** @type {string[]} */
  const versions = [];
  for (const entry of readdirSync(packagingDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const m = entry.name.match(DEB_FILENAME_REGEX);
    if (!m) continue;
    versions.push(m[1]);
  }
  if (versions.length === 0) return null;
  versions.sort(compareSemver);
  return versions[versions.length - 1];
}

/**
 * @param {string} defaultVersion
 */
async function askVersionFromConsole(defaultVersion) {
  const rl = createInterface({ input, output });
  try {
    console.log("\n📦 Deploy opensync-ubuntu");
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

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const cliVersion = (process.argv[2] ?? "").trim();
const versionFromPkg = (pkg.version ?? "0.1.0").trim() || "0.1.0";
const highestDebVersion = getHighestDebVersion();
const suggestedVersion = highestDebVersion
  ? incrementPatch(highestDebVersion)
  : incrementPatch(versionFromPkg);
const chosenVersion = cliVersion || (await askVersionFromConsole(suggestedVersion));
if (!isValidSemver(chosenVersion)) {
  console.error(`\n❌ Versão inválida: "${chosenVersion}". Use formato X.Y.Z\n`);
  process.exit(1);
}
const version = chosenVersion;
const sanitized = version.replace(/"/g, "");
const script = join(root, "apps/opensync-ubuntu/packaging/build-deb.sh");

execSync(`bash "${script}" "${sanitized}"`, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const debPath = join(root, "apps/opensync-ubuntu/packaging", `opensync-ubuntu_${sanitized}_amd64.deb`);
await uploadDebToSupabase(debPath, sanitized);
