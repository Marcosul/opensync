/** Helpers compartilhados entre dashboard, API de vaults e explorador. */

export function deriveVaultName(o: Record<string, unknown>): string {
  const label = typeof o.vaultName === "string" ? o.vaultName.trim() : "";
  if (label) return label;

  const mode = o.mode;
  if (mode === "gateway") {
    const url = typeof o.gatewayUrl === "string" ? o.gatewayUrl : "";
    try {
      return new URL(url).hostname || "gateway-vault";
    } catch {
      return "gateway-vault";
    }
  }
  if (mode === "ssh_key" || mode === "ssh_password") {
    const host = typeof o.host === "string" ? o.host : "";
    return host || "ssh-vault";
  }
  return "meu-vault";
}

export function deriveAgentMode(o: Record<string, unknown>): string {
  const mode = o.mode;
  if (mode === "gateway") return "gateway";
  if (mode === "ssh_key") return "ssh_key";
  if (mode === "ssh_password") return "ssh_password";
  return "unknown";
}

export function formatAgentPreview(o: Record<string, unknown>): string {
  const mode = o.mode;
  if (mode === "gateway") {
    const url = typeof o.gatewayUrl === "string" ? o.gatewayUrl : "";
    return url ? `Gateway: ${url}` : "Gateway configurado";
  }
  if (mode === "ssh_key") {
    const host = typeof o.host === "string" ? o.host : "";
    const port = typeof o.port === "number" ? o.port : 22;
    return host ? `SSH (chave): ${host}:${port}` : "SSH com chave";
  }
  if (mode === "ssh_password") {
    const host = typeof o.host === "string" ? o.host : "";
    const port = typeof o.port === "number" ? o.port : 22;
    return host ? `SSH: ${host}:${port}` : "SSH com senha";
  }
  return "Configurado";
}

export function deriveVaultExplorerKind(o: Record<string, unknown>): "openclaw" | "blank" {
  return o.mode === "gateway" ? "openclaw" : "blank";
}
