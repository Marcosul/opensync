/** Migra chaves de `noteContents` quando o prefixo de paths do vault muda. */
export function applyNoteContentsDocPrefixMigration(
  prev: Record<string, string>,
  from: string,
  to: string,
): Record<string, string> {
  if (from === to || from === "") return prev;
  const next = { ...prev };
  for (const key of Object.keys(prev)) {
    if (key.startsWith(from)) {
      const nk = to + key.slice(from.length);
      next[nk] = next[key]!;
      delete next[key];
    }
  }
  return next;
}

/** Mapa de remapeamento de docIds (tabs/UI) após migração de prefixo. */
export function buildDocIdRemapFromPrefixes(
  from: string,
  to: string,
  ids: readonly string[],
): Record<string, string> {
  const m: Record<string, string> = {};
  if (from === to || from === "") return m;
  for (const id of ids) {
    if (id.startsWith(from)) m[id] = to + id.slice(from.length);
  }
  return m;
}
