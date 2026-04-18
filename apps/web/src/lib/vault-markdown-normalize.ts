/**
 * Normalização partilhada entre o editor Plate e testes — deve espelhar
 * `normalizeVaultMarkdown` em `vault-plate-markdown-editor.tsx`.
 */
export function decodeAsciiSpaceCharRefs(md: string): string {
  return md.replace(/&#x0*20;/gi, " ").replace(/&#0*32;/g, " ");
}

export function normalizeVaultMarkdownForCompare(md: string): string {
  return decodeAsciiSpaceCharRefs(md.replace(/\r\n/g, "\n")).trimEnd();
}

/** True se o texto normalizado é vazio (equivalente a “sem corpo” no disco). */
export function isNormalizedVaultMarkdownEmpty(md: string): boolean {
  return normalizeVaultMarkdownForCompare(md) === "";
}

/** True se não há nenhum carácter não-espaço (útil para ignorar ruído do Plate antes da hidratação). */
export function isWhitespaceOnlyVaultMarkdown(md: string): boolean {
  return !/\S/.test(normalizeVaultMarkdownForCompare(md));
}
