/** Linha de mudança retornada pelo endpoint /changes e pelos eventos SSE */
export type ChangeRow = {
  change_id: string;
  path: string;
  version: string;
  deleted: boolean;
  content: string | null;
  updated_at: string;
};

/** Entrada no manifesto (GET /files/manifest) */
export type ManifestEntry = {
  path: string;
  size: number;
  version: string;
};

/** Estado local por arquivo no SQLite do agente */
export type FileState = {
  remote_version: string | null;
  last_synced_hash: string | null;
  is_deleted: number;
};
