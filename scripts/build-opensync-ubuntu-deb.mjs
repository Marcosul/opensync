#!/usr/bin/env node
/**
 * Gera apps/opensync-ubuntu/packaging/opensync-ubuntu_<versão>_amd64.deb
 * Versão: primeiro argumento CLI, senão `version` do package.json da raiz.
 * Uso: pnpm deb:opensync-ubuntu
 *       pnpm deb:opensync-ubuntu -- 0.2.0
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = (process.argv[2] ?? pkg.version ?? "0.1.0").trim() || "0.1.0";

const script = join(root, "apps/opensync-ubuntu/packaging/build-deb.sh");
execSync(`bash "${script}" "${version.replace(/"/g, "")}"`, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
