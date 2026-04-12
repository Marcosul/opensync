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
  return "---\nname: opensync\ndescription: OpenSync skill (fonte indisponível neste deploy).\n---\n\n# OpenSync\n\nO assistente **não gera tokens**. O utilizador fornece `usk_...` (Configurações → Tokens de acesso) para `opensync-ubuntu init` e `osk_...` para snapshot HTTP se necessário. Instalação Ubuntu: `curl -fsSL` ao `/install/ubuntu` do site OpenSync.\n";
}
