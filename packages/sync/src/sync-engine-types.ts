/**
 * Contratos alinhados com `docs/dev/sync-engine-v2.md` no repositório OpenSync.
 * Versões são strings para compatibilidade com a API actual (`version` / `base_version`).
 */

export type SyncPutOperation = {
  type: "put";
  path: string;
  contentHash: string;
  size: number;
  baseVersion: string | null;
};

export type SyncDeleteOperation = {
  type: "delete";
  path: string;
  baseVersion: string;
};

export type SyncRenameOperation = {
  type: "rename";
  fromPath: string;
  toPath: string;
  baseVersion: string;
};

export type SyncOperation = SyncPutOperation | SyncDeleteOperation | SyncRenameOperation;

export type SyncDecision =
  | { status: "upload_required"; uploadToken: string }
  | { status: "already_exists"; newVersion: string }
  | { status: "conflict"; serverVersion: string; serverHash: string }
  | { status: "fast_forward"; newVersion: string };

/** Pedido de diff de manifesto (Fase B do plano). */
export type ManifestDiffRequestEntry = {
  path: string;
  hash: string;
  version: string;
};

export type ManifestDiffResponse = {
  pull: Array<{ path: string; version: string }>;
  push: Array<{ path: string; baseVersion: string; uploadRequired: boolean }>;
  conflicts: Array<{ path: string; reason: string }>;
};
