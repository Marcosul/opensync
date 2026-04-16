import * as path from "node:path";

/**
 * Caminho relativo ao vault para uma cópia de conflito (estilo Obsidian).
 * Ex.: `notes/plan.md` → `notes/plan.conflict-abc123-20260415T201001Z.md`
 */
export function buildConflictCopyRelativePath(
  vaultRelativePath: string,
  deviceId: string,
  date: Date = new Date(),
): string {
  const norm = vaultRelativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const safeDevice = deviceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "device";
  const stamp = date.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dir = path.posix.dirname(norm);
  const base = path.posix.basename(norm);
  const m = base.match(/^(.+?)(\.[^./]+)?$/);
  const nameNoExt = m?.[1] ?? base;
  const ext = m?.[2] ?? "";
  const conflictName = `${nameNoExt}.conflict-${safeDevice}-${stamp}${ext}`;
  return dir === "." ? conflictName : `${dir}/${conflictName}`;
}
