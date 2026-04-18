/**
 * Wrapper sobre `@tauri-apps/api/core#invoke` com tipagem por comando.
 * Mantém compatibilidade com `apps/desktop/src-tauri/src/lib.rs`.
 */
import { invoke } from "@tauri-apps/api/core";

import type { UserVault } from "@opensync/types";

export interface AuthSession {
  apiUrl: string;
  uskToken: string;
  userId: string;
  email: string;
}

export interface DesktopInfo {
  version: string;
  platform: string;
  defaultApiUrl: string;
}

interface RawAuthSession {
  api_url: string;
  usk_token: string;
  user_id: string;
  email: string;
}

interface RawDesktopInfo {
  version: string;
  platform: string;
  default_api_url: string;
}

interface RawUserVault {
  id: string;
  name: string;
  description: string | null;
  workspace_name: string;
  created_at: string | null;
}

const sessionFromRaw = (raw: RawAuthSession): AuthSession => ({
  apiUrl: raw.api_url,
  uskToken: raw.usk_token,
  userId: raw.user_id,
  email: raw.email,
});

const vaultFromRaw = (raw: RawUserVault): UserVault => ({
  id: raw.id,
  name: raw.name,
  description: raw.description,
  workspaceName: raw.workspace_name,
  createdAt: raw.created_at,
});

export const ipc = {
  async desktopInfo(): Promise<DesktopInfo> {
    const raw = await invoke<RawDesktopInfo>("desktop_info");
    return {
      version: raw.version,
      platform: raw.platform,
      defaultApiUrl: raw.default_api_url,
    };
  },

  async login(params: {
    uskToken: string;
    apiUrl?: string;
  }): Promise<AuthSession> {
    const raw = await invoke<RawAuthSession>("auth_login", {
      uskToken: params.uskToken,
      apiUrl: params.apiUrl,
    });
    return sessionFromRaw(raw);
  },

  async logout(): Promise<void> {
    await invoke("auth_logout");
  },

  async currentSession(): Promise<AuthSession | null> {
    const raw = await invoke<RawAuthSession | null>("auth_current");
    return raw ? sessionFromRaw(raw) : null;
  },

  async listVaults(): Promise<UserVault[]> {
    const raw = await invoke<RawUserVault[]>("vaults_list");
    return raw.map(vaultFromRaw);
  },

  async createVault(name: string): Promise<UserVault> {
    const raw = await invoke<RawUserVault>("vaults_create", { name });
    return vaultFromRaw(raw);
  },
};
