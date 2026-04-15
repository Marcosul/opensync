/**
 * Alinhado com `packages/sync/src/merge.ts` — a API não depende de `@opensync/sync`
 * (imagem Docker só com `apps/api`).
 */
/** Local sem `<<<<<<< OPENSYNC_LOCAL` aninhado → primeiro match é o bloco mais interior. */
const OPENSYNC_CONFLICT_BLOCK =
  /<<<<<<< OPENSYNC_LOCAL\r?\n((?:(?!<<<<<<< OPENSYNC_LOCAL)[\s\S])*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> OPENSYNC_REMOTE\r?\n?/;

const MAX_STRIP_PASSES = 100;

function localSegmentWithTrailingNewline(local: string): string {
  if (local.length === 0) return local;
  return local.endsWith("\n") ? local : `${local}\n`;
}

/** Remove marcadores de merge OpenSync do texto persistido (legado ou aninhado). */
export function sanitizeOpenSyncArtifactContent(input: string): string {
  let s = input.replace(/\r\n/g, "\n");
  for (let i = 0; i < MAX_STRIP_PASSES; i++) {
    const next = s.replace(OPENSYNC_CONFLICT_BLOCK, (_, local: string) =>
      localSegmentWithTrailingNewline(local),
    );
    if (next === s) break;
    s = next;
  }
  return s;
}
