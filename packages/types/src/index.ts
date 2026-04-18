/**
 * Tipos partilhados entre `apps/web`, `apps/desktop`, `apps/api` e o
 * frontend dos apps mobile/desktop Tauri. Apenas tipos puros — sem deps.
 */

export interface UserProfile {
  userId: string;
  email: string;
}

export interface UserVault {
  id: string;
  name: string;
  description?: string | null;
  workspaceName: string;
  createdAt?: string | null;
}

export interface VaultFileEntry {
  path: string;
  size: number;
  version: string;
  hash?: string | null;
  fileId?: string | null;
}

export interface SyncTokenResponse {
  token: string;
}

export type SyncDirection = "pull" | "push" | "bidirectional";

export interface SyncResult {
  vaultId: string;
  direction: SyncDirection;
  filesUpdated: number;
  filesDeleted: number;
  conflicts: number;
  durationMs: number;
  cursor: string;
}

export interface SyncStatus {
  vaultId: string;
  syncDir: string;
  apiUrl: string;
  cursor: string;
  pendingMerges: string[];
  conflicts: string[];
  filesTracked: number;
  lastSyncAt?: string | null;
  isRunning: boolean;
}

export interface ConflictEntry {
  path: string;
  localVersion: string;
  remoteVersion: string;
  localHash: string;
  remoteHash: string;
  detectedAt: string;
}

export type ConflictResolution =
  | { kind: "keepLocal" }
  | { kind: "keepRemote" }
  | { kind: "manualMerge"; mergedContent: string };

export interface AuthCredentials {
  apiUrl: string;
  uskToken: string;
}

export interface DesktopVaultConfig {
  vaultId: string;
  syncDir: string;
  apiUrl: string;
  pollIntervalSeconds: number;
}

export type SyncEventKind =
  | "started"
  | "progress"
  | "completed"
  | "failed"
  | "conflictDetected";

export interface SyncEvent {
  kind: SyncEventKind;
  vaultId: string;
  message?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}
