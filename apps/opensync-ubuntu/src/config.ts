import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export type AgentConfig = {
  apiUrl: string;
  vaultId: string;
  syncDir: string;
  pollIntervalSeconds: number;
  ignore: string[];
  maxFileSizeBytes: number;
};

const DEFAULT_IGNORE = [".git", "node_modules", ".cache", ".DS_Store", "*.tmp", "*.swp"];

export function configDir(): string {
  return path.join(os.homedir(), ".config", "opensync");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function tokenPath(): string {
  return path.join(configDir(), "agent.token");
}

export function defaultConfigPath(): string {
  return configPath();
}

export function loadConfig(): AgentConfig {
  const p = configPath();
  if (!existsSync(p)) {
    throw new Error(`Config nao encontrada. Execute: opensync-ubuntu init (${p})`);
  }
  const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<AgentConfig>;
  if (!raw.apiUrl?.trim() || !raw.vaultId?.trim() || !raw.syncDir?.trim()) {
    throw new Error("config.json precisa de apiUrl, vaultId e syncDir");
  }
  return {
    apiUrl: raw.apiUrl.replace(/\/+$/, ""),
    vaultId: raw.vaultId.trim(),
    syncDir: path.resolve(raw.syncDir.trim()),
    pollIntervalSeconds: Math.max(5, raw.pollIntervalSeconds ?? 20),
    ignore: Array.isArray(raw.ignore) ? raw.ignore : DEFAULT_IGNORE,
    maxFileSizeBytes: raw.maxFileSizeBytes ?? 1048576,
  };
}

export function saveConfig(cfg: AgentConfig): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function saveToken(token: string): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(tokenPath(), token.trim(), { mode: 0o600 });
}

export function loadToken(): string {
  const env = process.env.OPENSYNC_AGENT_API_KEY?.trim();
  if (env) return env;
  const p = tokenPath();
  if (!existsSync(p)) {
    throw new Error(`Token ausente. Defina OPENSYNC_AGENT_API_KEY ou crie ${p}`);
  }
  return readFileSync(p, "utf8").trim();
}

export function sqlitePath(vaultId: string): string {
  const dir = path.join(os.homedir(), ".local", "share", "opensync-ubuntu");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, `${vaultId.replace(/[^a-zA-Z0-9-]/g, "_")}.sqlite`);
}
