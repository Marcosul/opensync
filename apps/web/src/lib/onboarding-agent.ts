export type AgentConnectionMode = "gateway" | "ssh_key" | "ssh_password";

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
    }
  | {
      mode: "ssh_password";
      host: string;
      port: number;
      user: string;
      password: string;
    };

/** JSON gravado em `profiles.agent_connection` (inclui nome opcional definido pelo usuario). */
export type AgentConnectionStored = AgentConnectionPayload & {
  vaultName?: string;
};

export type AgentConnectionForm = {
  agentMode: AgentConnectionMode;
  gatewayUrl: string;
  gatewayToken: string;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  sshPrivateKey: string;
  sshPassword: string;
};

export function buildAgentConnectionPayload(
  form: AgentConnectionForm,
): AgentConnectionPayload | null {
  const port = Number.parseInt(form.sshPort || "22", 10);
  const safePort = Number.isFinite(port) && port > 0 ? port : 22;

  if (form.agentMode === "gateway") {
    const gatewayUrl = form.gatewayUrl.trim();
    const gatewayToken = form.gatewayToken.trim();
    if (!gatewayUrl || !gatewayToken) return null;
    return { mode: "gateway", gatewayUrl, gatewayToken };
  }

  if (form.agentMode === "ssh_key") {
    const host = form.sshHost.trim();
    const user = form.sshUser.trim();
    const privateKey = form.sshPrivateKey.trim();
    if (!host || !user || !privateKey) return null;
    return { mode: "ssh_key", host, port: safePort, user, privateKey };
  }

  const host = form.sshHost.trim();
  const user = form.sshUser.trim();
  const password = form.sshPassword;
  if (!host || !user || !password) return null;
  return { mode: "ssh_password", host, port: safePort, user, password };
}

export function isAgentConnectionValid(form: AgentConnectionForm): boolean {
  return buildAgentConnectionPayload(form) !== null;
}

export function toStoredAgentConnection(
  connection: AgentConnectionPayload,
  vaultName: string | undefined,
): AgentConnectionStored {
  const trimmed = vaultName?.trim() ?? "";
  if (!trimmed) return connection;
  return { ...connection, vaultName: trimmed };
}
