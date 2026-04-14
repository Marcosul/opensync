#!/usr/bin/env node
/**
 * Gera apps/opensync-ubuntu/packaging/opensync-ubuntu_<versão>_amd64.deb
 * e envia para o bucket Supabase Storage `installer` (sobrescreve se existir).
 *
 * Versão: primeiro argumento CLI, senão `version` do package.json da raiz.
 * Uso: pnpm deb:opensync-ubuntu
 *       pnpm deb:opensync-ubuntu -- 0.2.0
 *
 * Env (ficheiros, por ordem; depois sobrepõe com variáveis do processo / export):
 *   .env, .env.local, apps/web/.env, apps/web/.env.local, apps/api/.env, apps/api/.env.local
 *   SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (service_role do dashboard — não anon/publishable)
 *   SKIP_DEB_UPLOAD=1 — só gera o .deb, sem upload
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER_BUCKET = "installer";

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

  const pick = (/** @type {string} */ k) =>
    String(process.env[k] ?? merged[k] ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");

  const supabaseUrl = (pick("SUPABASE_URL") || pick("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/+$/, "");
  const serviceKey = pick("SUPABASE_SERVICE_ROLE_KEY");
  return { supabaseUrl, serviceKey, mergedPaths: paths };
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

  const { supabaseUrl, serviceKey, mergedPaths } = mergedSupabaseEnv();
  if (!supabaseUrl || !serviceKey) {
    console.error("\n❌ Upload Supabase: faltam credenciais.");
    if (!supabaseUrl) {
      console.error("   • Falta URL: SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL");
    }
    if (!serviceKey) {
      console.error(
        "   • Falta SUPABASE_SERVICE_ROLE_KEY (secret service_role em Supabase → Settings → API).",
      );
      console.error("     Não serve anon nem publishable; cola em apps/api/.env ou export no terminal.");
    }
    console.error("\n   Ficheiros lidos (se existirem):");
    for (const p of mergedPaths) {
      const rel = p.startsWith(root) ? p.slice(root.length + 1) : p;
      console.error(`     - ${rel}`);
    }
    console.error("\n   Variáveis exportadas no shell (ex.: export SUPABASE_...) têm prioridade sobre .env.");
    console.error("   Ou: SKIP_DEB_UPLOAD=1 pnpm deb:opensync-ubuntu  → só gera o .deb.\n");
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

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = (process.argv[2] ?? pkg.version ?? "0.1.0").trim() || "0.1.0";
const sanitized = version.replace(/"/g, "");
const script = join(root, "apps/opensync-ubuntu/packaging/build-deb.sh");

execSync(`bash "${script}" "${sanitized}"`, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const debPath = join(root, "apps/opensync-ubuntu/packaging", `opensync-ubuntu_${sanitized}_amd64.deb`);
await uploadDebToSupabase(debPath, sanitized);
