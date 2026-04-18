/**
 * Helpers comuns aos scripts de deploy de .deb (opensync-ubuntu, core).
 * — Lê env (.env, .env.local, apps/web/.env, apps/api/.env, etc.)
 * — Faz upload para Supabase Storage bucket `installer` com upsert.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/** @param {string} root */
export function mergedSupabaseEnv(root) {
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
      const raw =
        candidate.source === "process"
          ? process.env[candidate.key]
          : merged[candidate.key];
      const value = normalize(raw);
      if (!value) continue;
      if (!firstNonEmpty) firstNonEmpty = { ...candidate, value };
      if (!isPlaceholder(value)) {
        return { ...candidate, value, placeholderDetected: false };
      }
    }
    return firstNonEmpty
      ? { ...firstNonEmpty, placeholderDetected: true }
      : null;
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
 * Faz upload (com sobrescrita) de um .deb para o bucket Supabase `installer`.
 * Honra `SKIP_DEB_UPLOAD=1` (apenas gera o ficheiro e não envia).
 *
 * @param {object} opts
 * @param {string} opts.root           - raiz do monorepo
 * @param {string} opts.debPath        - caminho absoluto do .deb
 * @param {string} opts.objectName     - nome final no bucket (ex.: opensync_0.2.0_amd64.deb)
 */
export async function uploadDebToSupabase({ root, debPath, objectName }) {
  if (process.env.SKIP_DEB_UPLOAD === "1") {
    console.log("\n⏭️  SKIP_DEB_UPLOAD=1 — upload ao Supabase ignorado.\n");
    return;
  }

  const { supabaseUrl, serviceKey, mergedPaths, urlMeta, serviceKeyMeta } =
    mergedSupabaseEnv(root);

  if (
    !supabaseUrl ||
    !serviceKey ||
    urlMeta?.placeholderDetected ||
    serviceKeyMeta?.placeholderDetected
  ) {
    console.error("\n\x1b[31m❌ Upload Supabase: configuração inválida.\x1b[0m");
    if (!supabaseUrl) {
      console.error("   • Falta URL: SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL");
    } else if (urlMeta?.placeholderDetected) {
      console.error(
        `   • URL inválida em ${urlMeta.source === "process" ? "variável exportada" : "ficheiro .env"} (${urlMeta.key}): ${supabaseUrl}`,
      );
    }
    if (!serviceKey) {
      console.error(
        "   • Falta SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API).",
      );
    } else if (serviceKeyMeta?.placeholderDetected) {
      console.error(
        `   • SUPABASE_SERVICE_ROLE_KEY inválida em ${serviceKeyMeta.source === "process" ? "variável exportada" : "ficheiro .env"} (${serviceKeyMeta.key}).`,
      );
    }
    console.error("\n   Ficheiros lidos (se existirem):");
    for (const p of mergedPaths) {
      const rel = p.startsWith(root) ? p.slice(root.length + 1) : p;
      console.error(`     - ${rel}`);
    }
    console.error("\n   Variáveis exportadas no shell têm prioridade sobre .env.");
    console.error("   Ou: SKIP_DEB_UPLOAD=1 → só gera o .deb.\n");
    process.exit(1);
  }

  if (!existsSync(debPath)) {
    console.error(`\n❌ Ficheiro .deb não encontrado: ${debPath}\n`);
    process.exit(1);
  }

  const body = readFileSync(debPath);
  const objectPath = `${INSTALLER_BUCKET}/${objectName}`;
  const objectUrl = `${supabaseUrl}/storage/v1/object/${objectPath}`;

  const uploadHeaders = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/vnd.debian.binary-package",
    "x-upsert": "true",
  };

  console.log("\n📤 A enviar para Supabase Storage…");
  console.log(`   bucket: ${INSTALLER_BUCKET}`);
  console.log(
    `   object: ${objectName} (${(body.length / (1024 * 1024)).toFixed(2)} MiB, overwrite)`,
  );

  let res = await fetch(objectUrl, {
    method: "POST",
    headers: uploadHeaders,
    body,
  });
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
      console.error(
        `\n❌ DELETE antes do re-upload falhou (${del.status}):`,
        delText || del.statusText,
        "\n",
      );
      process.exit(1);
    }
    res = await fetch(objectUrl, {
      method: "POST",
      headers: uploadHeaders,
      body,
    });
    text = await res.text().catch(() => "");
  }

  if (!res.ok) {
    console.error(
      `\n❌ Upload falhou (${res.status}):`,
      text || res.statusText,
      "\n",
    );
    process.exit(1);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${objectPath}`;
  console.log("\n✅ Upload concluído (object actualizado se já existia).");
  console.log(`   URL pública: ${publicUrl}\n`);
}

/** @param {string} value */
export function isValidSemver(value) {
  return /^\d+\.\d+\.\d+$/.test(value);
}

/** @param {string} a @param {string} b */
export function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/** @param {string} value */
export function incrementPatch(value) {
  const [major, minor, patch] = value.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}
