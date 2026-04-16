import { diffLines } from "diff";

/**
 * Bloco de conflito legado (versões antigas gravavam isto no texto do vault).
 * Removemos em loop para suportar aninhamento.
 */
/** Local não pode conter outro OPEN — assim o primeiro match é sempre o bloco mais interior. */
const OPENSYNC_CONFLICT_BLOCK =
  /<<<<<<< OPENSYNC_LOCAL\r?\n((?:(?!<<<<<<< OPENSYNC_LOCAL)[\s\S])*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> OPENSYNC_REMOTE\r?\n?/;

const MAX_STRIP_PASSES = 100;

/**
 * Remove marcadores `<<<<<<< OPENSYNC_LOCAL` … gravados por merges antigos.
 * Em cada bloco mantém o segmento **local** (primeiro branch), que corresponde
 * ao lado do cliente/agente na origem do merge.
 */
function localSegmentWithTrailingNewline(local: string): string {
  if (local.length === 0) return local;
  return local.endsWith("\n") ? local : `${local}\n`;
}

export function stripOpenSyncConflictMarkers(text: string): string {
  let s = text.replace(/\r\n/g, "\n");
  for (let i = 0; i < MAX_STRIP_PASSES; i++) {
    const next = s.replace(OPENSYNC_CONFLICT_BLOCK, (_, local: string) =>
      localSegmentWithTrailingNewline(local),
    );
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Quando local e remoto divergem, escolhe um lado de forma determinística
 * (sem inserir marcadores no ficheiro).
 */
export function mergeTextAutoResolve(
  local: string,
  remote: string,
  prefer: "local" | "remote",
): string {
  const L = stripOpenSyncConflictMarkers(local.replace(/\r\n/g, "\n"));
  const R = stripOpenSyncConflictMarkers(remote.replace(/\r\n/g, "\n"));
  if (L === R) return L;
  return prefer === "local" ? L : R;
}

/** Proporção de caracteres em trechos só-local / só-remoto vs comuns (diff por linhas). */
function lineDiffChangeRatio(left: string, right: string): number {
  const parts = diffLines(left, right);
  let common = 0;
  let changed = 0;
  for (const p of parts) {
    const n = p.value.length;
    if (p.added || p.removed) changed += n;
    else common += n;
  }
  return changed / Math.max(common + changed, 1);
}

/**
 * Funde dois textos sem ancestral comum: **diff por linhas** (jsdiff) e une
 * linhas comuns + só-local + só-remoto na ordem do algoritmo — adequado a Markdown.
 * Se quase não houver linhas comuns (ficheiros muito diferentes), faz *fallback*
 * para `mergeTextAutoResolve`.
 */
export function mergeTextAutomatic(
  local: string,
  remote: string,
  prefer: "local" | "remote" = "local",
): string {
  const L = stripOpenSyncConflictMarkers(local.replace(/\r\n/g, "\n"));
  const R = stripOpenSyncConflictMarkers(remote.replace(/\r\n/g, "\n"));
  if (L === R) return L;
  if (L === "") return R;
  if (R === "") return L;

  if (lineDiffChangeRatio(L, R) > 0.72) {
    return mergeTextAutoResolve(L, R, prefer);
  }

  const parts = diffLines(L, R);
  let out = "";
  for (const p of parts) {
    if (p.added) out += p.value;
    else if (p.removed) out += p.value;
    else out += p.value;
  }
  return out;
}

/**
 * Compat: nome antigo. Merge automático por linhas; casos extremos → lado local.
 */
export function mergeTextPreserveBoth(local: string, remote: string): string {
  return mergeTextAutomatic(local, remote, "local");
}

/**
 * Merge 3-way leve quando existe ancestral comum (último sync).
 * Casos triviais (só um lado divergiu da base); caso geral → `mergeTextPreserveBoth`.
 */
export function mergeTextThreeWayLite(base: string, local: string, remote: string): string {
  const B = stripOpenSyncConflictMarkers(base.replace(/\r\n/g, "\n"));
  const L = stripOpenSyncConflictMarkers(local.replace(/\r\n/g, "\n"));
  const R = stripOpenSyncConflictMarkers(remote.replace(/\r\n/g, "\n"));
  if (L === R) return L;
  if (L === B) return R;
  if (R === B) return L;
  return mergeTextPreserveBoth(L, R);
}
