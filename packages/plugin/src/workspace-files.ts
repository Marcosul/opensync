import { promises as fs } from "node:fs";
import * as path from "node:path";

const IGNORE_DIR_NAMES = new Set([".git", "node_modules", ".openclaw", ".next", "dist", "build"]);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_FILES = 2000;

/**
 * Recolhe ficheiros de texto do diretório do workspace para enviar à API de sync.
 * Caminhos são relativos com `/`. Ficheiros binários (null byte) são ignorados.
 */
export async function collectWorkspaceTextFiles(rootDir: string): Promise<Record<string, string>> {
  const absRoot = path.resolve(rootDir);
  const out: Record<string, string> = {};

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 32 || Object.keys(out).length >= MAX_TOTAL_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (IGNORE_DIR_NAMES.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(absRoot, full).split(path.sep).join("/");
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.isFile()) {
        let st;
        try {
          st = await fs.stat(full);
        } catch {
          continue;
        }
        if (st.size > MAX_FILE_BYTES) continue;
        let buf: Buffer;
        try {
          buf = await fs.readFile(full);
        } catch {
          continue;
        }
        if (buf.includes(0)) continue;
        out[rel] = buf.toString("utf8");
      }
    }
  }

  await walk(absRoot, 0);
  return out;
}
