import fs from "node:fs";
import path from "node:path";

/**
 * Lê `packages/plugin/skill/SKILL.md` a partir da raiz do monorepo (cwd típico: apps/web).
 */
export function readOpensyncSkillMarkdown(): string {
  const fromWeb = path.join(process.cwd(), "..", "..", "packages", "plugin", "skill", "SKILL.md");
  const fromRoot = path.join(process.cwd(), "packages", "plugin", "skill", "SKILL.md");
  for (const p of [fromWeb, fromRoot]) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf8");
      }
    } catch {
      /* next candidate */
    }
  }
  return "---\nname: opensync\ndescription: OpenSync skill (ficheiro fonte indisponível neste deploy).\n---\n\n# OpenSync\n\nConfigure OPENSYNC_API_URL, OPENSYNC_VAULT_ID e a API key no dashboard OpenSync.\n";
}
