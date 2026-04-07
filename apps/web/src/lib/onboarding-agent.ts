/** Diretorio de estado/config do OpenClaw na VPS (workspace inclui `workspace/` dentro desta arvore). */
export const DEFAULT_SSH_REMOTE_PATH = "~/.openclaw";

export type AgentConnectionMode = "ssh_key" | "ssh_password";

export type AgentConnectionPayload =
  | {
      mode: "gateway";
      gatewayUrl: string;
      gatewayToken: string;
    }
  | {
      mode: "ssh_key";
      host: string;
      port: number;
      user: string;
      privateKey: string;
      /** Ausente em perfis antigos; o servidor usa DEFAULT_SSH_REMOTE_PATH. */
      remotePath?: string;
    }
  | {
      mode: "ssh_password";
      host: string;
      port: number;
      user: string;
      password: string;
      remotePath?: string;
    };

/** JSON gravado em `profiles.agent_connection` (inclui nome opcional definido pelo usuario). */
export type AgentConnectionStored = AgentConnectionPayload & {
  vaultName?: string;
  /** ID do vault no Nest (repo Gitea) quando a criacao no backend teve sucesso. */
  backendVaultId?: string | null;
};

export type AgentConnectionForm = {
  agentMode: AgentConnectionMode;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  sshPrivateKey: string;
  sshPassword: string;
  sshRemotePath: string;
};

/** Linha unica tipo `authorized_keys` (algoritmo + base64 + comentario) — nao e PEM privado. */
export function looksLikeOpenSshPublicKeyLine(keyMaterial: string): boolean {
  const t = keyMaterial.trim();
  if (!t) return false;
  if (/BEGIN [A-Z ]*PRIVATE KEY/.test(t)) return false;
  const first = t.split(/\r?\n/)[0]?.trim() ?? "";
  return /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\s+\S/.test(
    first,
  );
}

export function getAgentConnectionValidationMessage(form: AgentConnectionForm): string | null {
  if (form.agentMode !== "ssh_key") return null;
  const k = form.sshPrivateKey.trim();
  if (!k) return null;
  if (looksLikeOpenSshPublicKeyLine(k)) {
    return "Isto parece a chave publica (uma linha que comeca com ssh-ed25519 ou ssh-rsa). Neste campo deve ir a chave privada: varias linhas com -----BEGIN OPENSSH PRIVATE KEY----- (ou RSA/EC). A publica fica so no servidor, em ~/.ssh/authorized_keys.";
  }
  return null;
}

export function buildAgentConnectionPayload(
  form: AgentConnectionForm,
): Exclude<AgentConnectionPayload, { mode: "gateway" }> | null {
  const port = Number.parseInt(form.sshPort || "22", 10);
  const safePort = Number.isFinite(port) && port > 0 && port <= 65535 ? port : 22;
  const remotePath = form.sshRemotePath.trim() || DEFAULT_SSH_REMOTE_PATH;

  if (form.agentMode === "ssh_key") {
    const host = form.sshHost.trim();
    const user = form.sshUser.trim();
    const privateKey = form.sshPrivateKey.trim();
    if (!host || !user || !privateKey) return null;
    if (looksLikeOpenSshPublicKeyLine(privateKey)) return null;
    return { mode: "ssh_key", host, port: safePort, user, privateKey, remotePath };
  }

  const host = form.sshHost.trim();
  const user = form.sshUser.trim();
  const password = form.sshPassword;
  if (!host || !user || !password) return null;
  return { mode: "ssh_password", host, port: safePort, user, password, remotePath };
}

export function isAgentConnectionValid(form: AgentConnectionForm): boolean {
  return buildAgentConnectionPayload(form) !== null;
}

export function toStoredAgentConnection(
  connection: Exclude<AgentConnectionPayload, { mode: "gateway" }>,
  vaultName: string | undefined,
): AgentConnectionStored {
  const trimmed = vaultName?.trim() ?? "";
  if (!trimmed) return connection;
  return { ...connection, vaultName: trimmed };
}
