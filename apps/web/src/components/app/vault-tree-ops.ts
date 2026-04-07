import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";

export function cloneTreeEntry(entry: TreeEntry): TreeEntry {
  if (entry.type === "dir") {
    return { ...entry, children: entry.children.map(cloneTreeEntry) };
  }
  return { ...entry };
}

export function collectDocIdsFromTree(entries: TreeEntry[]): string[] {
  const out: string[] = [];
  function walk(es: TreeEntry[]) {
    for (const e of es) {
      if (e.type === "file" && "docId" in e) out.push(e.docId);
      if (e.type === "dir") walk(e.children);
    }
  }
  walk(entries);
  return out;
}

export function collectDocIdsUnderDir(dir: TreeEntry & { type: "dir" }): string[] {
  return collectDocIdsFromTree(dir.children);
}

/** Prefixo do docId para arquivos dentro desta pasta (ex.: `memory/`). */
export function docIdPrefixFromDirPath(dirPath: string): string {
  if (
    dirPath === "openclaw-root" ||
    dirPath === "openclaw/workspace" ||
    dirPath === "vault-root"
  ) {
    return "";
  }
  if (dirPath.startsWith("openclaw/workspace/")) {
    return `${dirPath.slice("openclaw/workspace/".length)}/`;
  }
  if (dirPath.startsWith("openclaw/")) {
    return `${dirPath.slice("openclaw/".length)}/`;
  }
  return "";
}

export function docIdForFileInParent(parentTreePath: string, fileName: string): string {
  const prefix = docIdPrefixFromDirPath(parentTreePath);
  return prefix ? `${prefix}${fileName}` : fileName;
}

function compareEntries(a: TreeEntry, b: TreeEntry): number {
  const aDir = a.type === "dir" ? 0 : 1;
  const bDir = b.type === "dir" ? 0 : 1;
  if (aDir !== bDir) return aDir - bDir;
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
}

function insertSorted(entries: TreeEntry[], newEntry: TreeEntry): TreeEntry[] {
  return [...entries, newEntry].sort(compareEntries);
}

function sanitizeFolderName(raw: string): string | null {
  const t = raw.trim().replace(/[/\\]/g, "");
  return t.length > 0 ? t : null;
}

function sanitizeFileName(raw: string): string | null {
  const t = raw.trim().replace(/[/\\]/g, "");
  return t.length > 0 ? t : null;
}

/** Nome base padrão para novas notas, alinhado ao Obsidian (`Untitled.md`, `Untitled 2.md`, …). */
const DEFAULT_MARKDOWN_NOTE_BASENAME = "Untitled";

function findFileNameForDocId(entries: TreeEntry[], docId: string): string | null {
  for (const e of entries) {
    if (e.type === "file" && "docId" in e && e.docId === docId) return e.name;
    if (e.type === "dir") {
      const n = findFileNameForDocId(e.children, docId);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Ao renomear um .md, se o novo nome não tiver extensão (sem `.` no nome), acrescenta `.md` como no Obsidian.
 */
function ensureMarkdownExtensionForRename(oldFileName: string | null, sanitizedNewName: string): string {
  if (!sanitizedNewName) return sanitizedNewName;
  const wasMd = oldFileName != null && /\.md$/i.test(oldFileName);
  if (!wasMd) return sanitizedNewName;
  if (/\.md$/i.test(sanitizedNewName)) return sanitizedNewName;
  if (sanitizedNewName.includes(".")) return sanitizedNewName;
  return `${sanitizedNewName}.md`;
}

function existingNamesInParent(
  entries: TreeEntry[],
  parentPath: string,
  treeRootPath: string
): Set<string> {
  if (parentPath === treeRootPath) {
    return new Set(entries.map((c) => c.name));
  }
  const set = new Set<string>();
  function walk(es: TreeEntry[]): boolean {
    for (const e of es) {
      if (e.type === "dir" && e.path === parentPath) {
        for (const c of e.children) set.add(c.name);
        return true;
      }
      if (e.type === "dir" && walk(e.children)) return true;
    }
    return false;
  }
  walk(entries);
  return set;
}

function addChildToDir(entries: TreeEntry[], dirPath: string, child: TreeEntry): TreeEntry[] {
  return entries.map((e) => {
    if (e.type === "dir" && e.path === dirPath) {
      return { ...e, children: insertSorted(e.children, child) };
    }
    if (e.type === "dir") {
      return { ...e, children: addChildToDir(e.children, dirPath, child) };
    }
    return e;
  });
}

export type EnsureMissionMdResult =
  | { ok: true; root: TreeEntry; docId: string; existed: boolean }
  | { ok: false; reason: string };

/** Garante `MISSION.md` na pasta do workspace (`vault-root` ou `openclaw/workspace`). */
export function ensureMissionMdFile(root: TreeEntry, parentTreePath: string): EnsureMissionMdResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  const docId = docIdForFileInParent(parentTreePath, "MISSION.md");

  if (root.path === parentTreePath) {
    const existing = root.children.find(
      (c): c is TreeEntry & { type: "file"; docId: string } =>
        c.type === "file" && "docId" in c && c.name === "MISSION.md",
    );
    if (existing) return { ok: true, root, docId: existing.docId, existed: true };
    const child: TreeEntry = { type: "file", name: "MISSION.md", docId };
    return {
      ok: true,
      root: { ...root, children: insertSorted(root.children, child) },
      docId,
      existed: false,
    };
  }

  const parent = findDir(root.children, parentTreePath);
  if (!parent) return { ok: false, reason: "Pasta não encontrada" };
  const existingNested = parent.children.find(
    (c): c is TreeEntry & { type: "file"; docId: string } =>
      c.type === "file" && "docId" in c && c.name === "MISSION.md",
  );
  if (existingNested) return { ok: true, root, docId: existingNested.docId, existed: true };
  const child: TreeEntry = { type: "file", name: "MISSION.md", docId };
  const nextChildren = addChildToDir(root.children, parentTreePath, child);
  return { ok: true, root: { ...root, children: nextChildren }, docId, existed: false };
}

export function findDir(entries: TreeEntry[], dirPath: string): (TreeEntry & { type: "dir" }) | null {
  for (const e of entries) {
    if (e.type === "dir") {
      if (e.path === dirPath) return e;
      const inner = findDir(e.children, dirPath);
      if (inner) return inner;
    }
  }
  return null;
}

function findParentPathForDoc(entries: TreeEntry[], docId: string, ancestorPath: string): string | null {
  for (const e of entries) {
    if (e.type === "file" && "docId" in e && e.docId === docId) {
      return ancestorPath;
    }
    if (e.type === "dir") {
      const found = findParentPathForDoc(e.children, docId, e.path);
      if (found !== null) return found;
    }
  }
  return null;
}

export function getParentTreePathForDoc(root: TreeEntry, docId: string): string | null {
  if (root.type !== "dir") return null;
  return findParentPathForDoc(root.children, docId, root.path);
}

function removeFileFromEntries(entries: TreeEntry[], docId: string): TreeEntry[] {
  const out: TreeEntry[] = [];
  for (const e of entries) {
    if (e.type === "file" && "docId" in e && e.docId === docId) continue;
    if (e.type === "dir") {
      out.push({ ...e, children: removeFileFromEntries(e.children, docId) });
    } else {
      out.push(e);
    }
  }
  return out;
}

function removeDirFromEntries(entries: TreeEntry[], dirPath: string): TreeEntry[] {
  return entries
    .filter((e) => !(e.type === "dir" && e.path === dirPath))
    .map((e) => (e.type === "dir" ? { ...e, children: removeDirFromEntries(e.children, dirPath) } : e));
}

function uniqueNameInParent(
  entries: TreeEntry[],
  parentPath: string,
  base: string,
  ext: string,
  isDir: boolean,
  treeRootPath: string
): string {
  const names = existingNamesInParent(entries, parentPath, treeRootPath);
  let candidate = isDir ? base : `${base}${ext}`;
  let i = 2;
  while (names.has(candidate)) {
    candidate = isDir ? `${base} ${i}` : `${base} ${i}${ext}`;
    i += 1;
  }
  return candidate;
}

export type AddNoteResult =
  | { ok: true; root: TreeEntry; docId: string; fileName: string }
  | { ok: false; reason: string };

export function addNoteToParent(
  root: TreeEntry,
  parentTreePath: string,
  preferredBase = DEFAULT_MARKDOWN_NOTE_BASENAME
): AddNoteResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  const treeRootPath = root.path;

  if (parentTreePath === treeRootPath) {
    const fileName = uniqueNameInParent(
      root.children,
      parentTreePath,
      preferredBase,
      ".md",
      false,
      treeRootPath
    );
    const docId = docIdForFileInParent(parentTreePath, fileName);
    const child: TreeEntry = { type: "file", name: fileName, docId };
    return {
      ok: true,
      root: { ...root, children: insertSorted(root.children, child) },
      docId,
      fileName,
    };
  }

  const parent = findDir(root.children, parentTreePath);
  if (!parent) return { ok: false, reason: "Pasta não encontrada" };

  const fileName = uniqueNameInParent(
    root.children,
    parentTreePath,
    preferredBase,
    ".md",
    false,
    treeRootPath
  );
  const docId = docIdForFileInParent(parentTreePath, fileName);
  const child: TreeEntry = { type: "file", name: fileName, docId };
  const nextChildren = addChildToDir(root.children, parentTreePath, child);
  return { ok: true, root: { ...root, children: nextChildren }, docId, fileName };
}

export type AddDirResult =
  | { ok: true; root: TreeEntry; path: string; name: string }
  | { ok: false; reason: string };

export function addFolderToParent(root: TreeEntry, parentTreePath: string, preferredBase = "Nova pasta"): AddDirResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  const treeRootPath = root.path;

  if (parentTreePath === treeRootPath) {
    const name = uniqueNameInParent(root.children, parentTreePath, preferredBase, "", true, treeRootPath);
    const path = `${parentTreePath}/${name}`;
    const child: TreeEntry = { type: "dir", name, path, children: [] };
    return {
      ok: true,
      root: { ...root, children: insertSorted(root.children, child) },
      path,
      name,
    };
  }

  const parent = findDir(root.children, parentTreePath);
  if (!parent) return { ok: false, reason: "Pasta não encontrada" };

  const name = uniqueNameInParent(root.children, parentTreePath, preferredBase, "", true, treeRootPath);
  const path = `${parentTreePath}/${name}`;
  const child: TreeEntry = { type: "dir", name, path, children: [] };
  const nextChildren = addChildToDir(root.children, parentTreePath, child);
  return { ok: true, root: { ...root, children: nextChildren }, path, name };
}

export function addCanvasToParent(root: TreeEntry, parentTreePath: string): AddNoteResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  const treeRootPath = root.path;

  if (parentTreePath === treeRootPath) {
    const fileName = uniqueNameInParent(
      root.children,
      parentTreePath,
      "Sem título",
      ".canvas",
      false,
      treeRootPath
    );
    const docId = docIdForFileInParent(parentTreePath, fileName);
    const child: TreeEntry = { type: "file", name: fileName, docId };
    return {
      ok: true,
      root: { ...root, children: insertSorted(root.children, child) },
      docId,
      fileName,
    };
  }

  const parent = findDir(root.children, parentTreePath);
  if (!parent) return { ok: false, reason: "Pasta não encontrada" };

  const fileName = uniqueNameInParent(
    root.children,
    parentTreePath,
    "Sem título",
    ".canvas",
    false,
    treeRootPath
  );
  const docId = docIdForFileInParent(parentTreePath, fileName);
  const child: TreeEntry = { type: "file", name: fileName, docId };
  const nextChildren = addChildToDir(root.children, parentTreePath, child);
  return { ok: true, root: { ...root, children: nextChildren }, docId, fileName };
}

export function addBaseToParent(root: TreeEntry, parentTreePath: string): AddNoteResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  const treeRootPath = root.path;

  if (parentTreePath === treeRootPath) {
    const fileName = uniqueNameInParent(
      root.children,
      parentTreePath,
      "Sem título",
      ".base",
      false,
      treeRootPath
    );
    const docId = docIdForFileInParent(parentTreePath, fileName);
    const child: TreeEntry = { type: "file", name: fileName, docId };
    return {
      ok: true,
      root: { ...root, children: insertSorted(root.children, child) },
      docId,
      fileName,
    };
  }

  const parent = findDir(root.children, parentTreePath);
  if (!parent) return { ok: false, reason: "Pasta não encontrada" };

  const fileName = uniqueNameInParent(
    root.children,
    parentTreePath,
    "Sem título",
    ".base",
    false,
    treeRootPath
  );
  const docId = docIdForFileInParent(parentTreePath, fileName);
  const child: TreeEntry = { type: "file", name: fileName, docId };
  const nextChildren = addChildToDir(root.children, parentTreePath, child);
  return { ok: true, root: { ...root, children: nextChildren }, docId, fileName };
}

export type TreeOpResult = { ok: true; root: TreeEntry } | { ok: false; reason: string };

export function deleteFile(root: TreeEntry, docId: string): TreeOpResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  return { ok: true, root: { ...root, children: removeFileFromEntries(root.children, docId) } };
}

export function deleteDirectory(root: TreeEntry, dirPath: string): TreeOpResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  if (
    dirPath === "openclaw-root" ||
    dirPath === "openclaw/workspace" ||
    dirPath === "vault-root"
  ) {
    return { ok: false, reason: "Não é possível apagar esta pasta." };
  }
  return { ok: true, root: { ...root, children: removeDirFromEntries(root.children, dirPath) } };
}

export function renameFile(
  root: TreeEntry,
  docId: string,
  newNameRaw: string
): TreeOpResult & { newDocId?: string } {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  const oldFileName = findFileNameForDocId(root.children, docId);
  const sanitized = sanitizeFileName(newNameRaw);
  if (!sanitized) return { ok: false, reason: "Nome inválido" };
  const name = ensureMarkdownExtensionForRename(oldFileName, sanitized);

  const parentPath = getParentTreePathForDoc(root, docId);
  if (parentPath === null) return { ok: false, reason: "Arquivo não encontrado" };

  const newDocId = docIdForFileInParent(parentPath, name);
  const names = existingNamesInParent(root.children, parentPath, root.path);
  if (newDocId !== docId && names.has(name)) {
    return { ok: false, reason: "Já existe um item com esse nome." };
  }

  let updated = false;
  function patch(entries: TreeEntry[]): TreeEntry[] {
    return entries.map((e) => {
      if (e.type === "file" && "docId" in e && e.docId === docId) {
        updated = true;
        return { type: "file", name, docId: newDocId } as TreeEntry;
      }
      if (e.type === "dir") {
        return { ...e, children: patch(e.children) };
      }
      return e;
    });
  }
  const nextChildren = patch(root.children);
  if (!updated) return { ok: false, reason: "Arquivo não encontrado" };
  return { ok: true, root: { ...root, children: nextChildren }, newDocId };
}

function rewriteSubtreePaths(
  entry: TreeEntry,
  oldPathPrefix: string,
  newPathPrefix: string,
  oldDocPrefix: string,
  newDocPrefix: string
): TreeEntry {
  if (entry.type === "file") {
    if (!("docId" in entry)) return entry;
    let docId = entry.docId;
    if (oldDocPrefix !== "" && docId.startsWith(oldDocPrefix)) {
      docId = newDocPrefix + docId.slice(oldDocPrefix.length);
    }
    return { ...entry, docId };
  }
  let path = entry.path;
  if (path === oldPathPrefix || path.startsWith(`${oldPathPrefix}/`)) {
    path = newPathPrefix + path.slice(oldPathPrefix.length);
  }
  return {
    ...entry,
    path,
    children: entry.children.map((c) =>
      rewriteSubtreePaths(c, oldPathPrefix, newPathPrefix, oldDocPrefix, newDocPrefix)
    ),
  };
}

export type RenameDirectoryResult =
  | { ok: true; root: TreeEntry; docPrefixFrom: string; docPrefixTo: string }
  | { ok: false; reason: string };

export function renameDirectory(root: TreeEntry, dirPath: string, newNameRaw: string): RenameDirectoryResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  if (
    dirPath === "openclaw-root" ||
    dirPath === "openclaw/workspace" ||
    dirPath === "vault-root"
  ) {
    return { ok: false, reason: "Não é possível renomear esta pasta." };
  }

  const sanitizedName = sanitizeFolderName(newNameRaw);
  if (!sanitizedName) return { ok: false, reason: "Nome inválido" };
  const folderName: string = sanitizedName;

  const parentPath = dirPath.slice(0, dirPath.lastIndexOf("/"));
  const newPath = `${parentPath}/${folderName}`;
  const docPrefixFrom = docIdPrefixFromDirPath(dirPath);
  const docPrefixTo = docIdPrefixFromDirPath(newPath);

  const dir = findDir(root.children, dirPath);
  if (!dir) return { ok: false, reason: "Pasta não encontrada" };

  const names = existingNamesInParent(root.children, parentPath, root.path);
  if (names.has(folderName) && newPath !== dirPath) {
    return { ok: false, reason: "Já existe um item com esse nome." };
  }

  function patch(entries: TreeEntry[]): TreeEntry[] {
    return entries.map((e) => {
      if (e.type === "dir" && e.path === dirPath) {
        const renamed: TreeEntry = {
          ...e,
          name: folderName,
          path: newPath,
          children: e.children.map((c) =>
            rewriteSubtreePaths(c, dirPath, newPath, docPrefixFrom, docPrefixTo)
          ),
        };
        return renamed;
      }
      if (e.type === "dir") {
        return { ...e, children: patch(e.children) };
      }
      return e;
    });
  }

  return { ok: true, root: { ...root, children: patch(root.children) }, docPrefixFrom, docPrefixTo };
}

export type MoveDirectoryResult =
  | { ok: true; root: TreeEntry; docPrefixFrom: string; docPrefixTo: string }
  | { ok: false; reason: string };

function isUnderPath(candidate: string, ancestor: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

export function moveFile(
  root: TreeEntry,
  docId: string,
  targetParentPath: string
): TreeOpResult & { newDocId?: string } {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  const sourceParent = getParentTreePathForDoc(root, docId);
  if (sourceParent === null) return { ok: false, reason: "Arquivo não encontrado" };

  const targetDir =
    targetParentPath === root.path ? root : findDir(root.children, targetParentPath);
  if (!targetDir || targetDir.type !== "dir") return { ok: false, reason: "Pasta de destino não encontrada" };

  let fileName = "";
  function findName(es: TreeEntry[]): boolean {
    for (const e of es) {
      if (e.type === "file" && "docId" in e && e.docId === docId) {
        fileName = e.name;
        return true;
      }
      if (e.type === "dir" && findName(e.children)) return true;
    }
    return false;
  }
  findName(root.children);
  if (!fileName) return { ok: false, reason: "Arquivo não encontrado" };

  const adjustedName = uniqueNameInParent(
    root.children,
    targetParentPath,
    fileName.replace(/\.[^.]+$/, ""),
    fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "",
    false,
    root.path
  );

  const newDocId = docIdForFileInParent(targetParentPath, adjustedName);
  const without = removeFileFromEntries(root.children, docId);
  const tmpRoot: TreeEntry = { type: "dir", name: root.name, path: root.path, children: without };
  const moved: TreeEntry = { type: "file", name: adjustedName, docId: newDocId };
  const withAdded =
    targetParentPath === root.path
      ? insertSorted(tmpRoot.children, moved)
      : addChildToDir(tmpRoot.children, targetParentPath, moved);
  return { ok: true, root: { ...root, children: withAdded }, newDocId };
}

export function moveDirectory(root: TreeEntry, dirPath: string, targetParentPath: string): MoveDirectoryResult {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  if (
    dirPath === "openclaw-root" ||
    dirPath === "openclaw/workspace" ||
    dirPath === "vault-root"
  ) {
    return { ok: false, reason: "Não é possível mover esta pasta." };
  }

  if (isUnderPath(targetParentPath, dirPath)) {
    return { ok: false, reason: "Não é possível mover uma pasta para dentro dela mesma." };
  }

  const dir = findDir(root.children, dirPath);
  if (!dir) return { ok: false, reason: "Pasta não encontrada" };

  const targetDir =
    targetParentPath === root.path ? root : findDir(root.children, targetParentPath);
  if (!targetDir || targetDir.type !== "dir") return { ok: false, reason: "Pasta de destino não encontrada" };

  const folderName = uniqueNameInParent(root.children, targetParentPath, dir.name, "", true, root.path);
  const newPath = `${targetParentPath}/${folderName}`;

  const oldDocP = docIdPrefixFromDirPath(dirPath);
  const newDocP = docIdPrefixFromDirPath(newPath);

  const lifted = removeDirFromEntries(root.children, dirPath);
  const tmpRoot: TreeEntry = { type: "dir", name: root.name, path: root.path, children: lifted };
  const rewritten = rewriteSubtreePaths(dir, dirPath, newPath, oldDocP, newDocP) as TreeEntry & {
    type: "dir";
  };
  const subtree: TreeEntry & { type: "dir" } = { ...rewritten, name: folderName };

  const placed =
    targetParentPath === root.path
      ? insertSorted(tmpRoot.children, subtree)
      : addChildToDir(tmpRoot.children, targetParentPath, subtree);
  return {
    ok: true,
    root: { ...root, children: placed },
    docPrefixFrom: oldDocP,
    docPrefixTo: newDocP,
  };
}

export function duplicateFile(root: TreeEntry, docId: string): TreeOpResult & { newDocId?: string } {
  if (root.type !== "dir") return { ok: false, reason: "Raiz inválida" };
  const parentPath = getParentTreePathForDoc(root, docId);
  if (parentPath === null) return { ok: false, reason: "Arquivo não encontrado" };

  let baseName = "";
  let ext = "";
  function findMeta(es: TreeEntry[]): boolean {
    for (const e of es) {
      if (e.type === "file" && "docId" in e && e.docId === docId) {
        const dot = e.name.lastIndexOf(".");
        if (dot > 0) {
          baseName = e.name.slice(0, dot);
          ext = e.name.slice(dot);
        } else {
          baseName = e.name;
          ext = "";
        }
        return true;
      }
      if (e.type === "dir" && findMeta(e.children)) return true;
    }
    return false;
  }
  findMeta(root.children);

  const copyBase = `${baseName} (cópia)`;
  const fileName = uniqueNameInParent(root.children, parentPath, copyBase, ext || "", false, root.path);
  const newDocId = docIdForFileInParent(parentPath, fileName);
  const child: TreeEntry = { type: "file", name: fileName, docId: newDocId };
  const nextChildren =
    parentPath === root.path
      ? insertSorted(root.children, child)
      : addChildToDir(root.children, parentPath, child);
  return {
    ok: true,
    root: { ...root, children: nextChildren },
    newDocId,
  };
}

export function getChildrenAtPath(
  entries: TreeEntry[],
  dirPath: string,
  treeRootPath: string
): TreeEntry[] | null {
  if (dirPath === treeRootPath) return entries;
  for (const e of entries) {
    if (e.type === "dir") {
      if (e.path === dirPath) return e.children;
      const inner = getChildrenAtPath(e.children, dirPath, treeRootPath);
      if (inner !== null) return inner;
    }
  }
  return null;
}

export function filterEntriesByNameQuery(entries: TreeEntry[], query: string): TreeEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  function filter(es: TreeEntry[]): TreeEntry[] {
    const out: TreeEntry[] = [];
    for (const e of es) {
      if (e.type === "file" && "docId" in e) {
        if (e.name.toLowerCase().includes(q)) out.push(e);
      } else if (e.type === "dir") {
        const kids = filter(e.children);
        if (kids.length > 0) out.push({ ...e, children: kids });
      }
    }
    return out;
  }
  return filter(entries);
}

export function findAncestorDirPathsForDoc(entries: TreeEntry[], docId: string): string[] {
  function walk(es: TreeEntry[], acc: string[]): string[] | null {
    for (const e of es) {
      if (e.type === "file" && "docId" in e && e.docId === docId) {
        return acc;
      }
      if (e.type === "dir") {
        const r = walk(e.children, [...acc, e.path]);
        if (r !== null) return r;
      }
    }
    return null;
  }
  return walk(entries, []) ?? [];
}

export function extractWikilinks(markdown: string): string[] {
  const re = /\[\[([^\]]+)\]\]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const inner = m[1].trim();
    const target = inner.split("|")[0]?.trim();
    if (target) out.push(target);
  }
  return out;
}

