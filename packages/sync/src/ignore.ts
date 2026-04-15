/** Padrões de path que o agente ignora por padrão */
export const DEFAULT_IGNORE = [".git", "node_modules", ".cache", ".DS_Store"];

/**
 * Retorna true se o caminho relativo deve ser ignorado pelo agente.
 * Respeita a lista de padrões configurados + extensões temporárias universais.
 */
export function shouldIgnore(ignore: string[], rel: string): boolean {
  const parts = rel.split("/");
  for (const p of parts) {
    if (ignore.includes(p)) return true;
    if (p.endsWith(".tmp") || p.endsWith(".swp")) return true;
  }
  return false;
}
