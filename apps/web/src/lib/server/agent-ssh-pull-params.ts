import type { AgentConnectionStored } from "@/lib/onboarding-agent";
import { DEFAULT_SSH_REMOTE_PATH } from "@/lib/onboarding-agent";

import type { SshPullAuth } from "./ssh-workspace-pull";

/** Antes o default era so workspace; alinhar importacao a ~/.openclaw completo. */
export function normalizeStoredRemotePath(raw: string): string {
  const t = raw.trim();
  if (t === "~/.openclaw/workspace" || t === "~/.openclaw/workspace/") {
    return "~/.openclaw";
  }
  return t;
}

export function sshPullAuthFromStored(stored: AgentConnectionStored): SshPullAuth | null {
  if (stored.mode === "gateway") return null;

  const remotePathRaw = normalizeStoredRemotePath(
    typeof stored.remotePath === "string" && stored.remotePath.trim()
      ? stored.remotePath.trim()
      : DEFAULT_SSH_REMOTE_PATH,
  );

  if (stored.mode === "ssh_key") {
    return {
      host: stored.host.trim(),
      port: stored.port,
      username: stored.user.trim(),
      privateKey: stored.privateKey,
      remotePathRaw,
    };
  }
  if (stored.mode === "ssh_password") {
    return {
      host: stored.host.trim(),
      port: stored.port,
      username: stored.user.trim(),
      password: stored.password,
      remotePathRaw,
    };
  }
  return null;
}
