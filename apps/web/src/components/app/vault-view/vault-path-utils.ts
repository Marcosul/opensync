/** Ancestores de um path de árvore (segmentos acima), do root ao pai direto. */
export function treePathAncestors(path: string): string[] {
  const out: string[] = [];
  let p = path;
  while (true) {
    const i = p.lastIndexOf("/");
    if (i <= 0) break;
    p = p.slice(0, i);
    out.push(p);
  }
  return out.reverse();
}
