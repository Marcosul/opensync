/**
 * Classificação simples por extensão do path do doc (vault Git / explorador).
 */

const PLAIN_TEXT_OR_CODE_EXT =
  /\.(txt|csv|tsv|json|jsonc|jsonl|py|js|mjs|cjs|ts|tsx|jsx|vue|svelte|yaml|yml|toml|xml|html?|css|scss|sass|less|sh|bash|zsh|rs|go|java|kt|swift|c|h|cpp|hpp|cs|php|rb|sql|ini|cfg|conf|log|env|dockerfile)$/i;

/** Sessões / logs em JSON Lines (uma linha = um objeto JSON). */
export function isVaultJsonlDocId(docId: string): boolean {
  return /\.jsonl$/i.test(docId?.trim() ?? "");
}

/** Ficheiros que não devem passar pelo preview Markdown (blocos). */
export function isVaultPlainTextDocId(docId: string): boolean {
  if (!docId?.trim()) return false;
  if (/\.md$/i.test(docId)) return false;
  return PLAIN_TEXT_OR_CODE_EXT.test(docId);
}
