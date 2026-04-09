import type { VaultListItem } from "@/lib/vault-list-types";

export const WIZARD_DRAFT_KEY = "opensync-wizard-draft";

const TOKEN_PREFIX = "opensync-wizard-agent-token:";

export type StartChoice = "agent_project" | "connect_agent" | "empty_vault";
export type AgentProjectScope = "single_agent" | "agent_squad";

export type WizardDraft = {
  vaultName: string;
  squadMission: string;
  agentProjectScope: AgentProjectScope;
};

const DEFAULT_DRAFT: WizardDraft = {
  vaultName: "",
  squadMission: "",
  agentProjectScope: "single_agent",
};

export function isStartChoice(s: string | null): s is StartChoice {
  return s === "agent_project" || s === "connect_agent" || s === "empty_vault";
}

export function isAgentProjectScope(s: string | null): s is AgentProjectScope {
  return s === "single_agent" || s === "agent_squad";
}

export function clampWizardStep(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 3) return 3;
  return Math.floor(n);
}

export function parseWizardSearchParams(searchParams: URLSearchParams): {
  step: number;
  mode: StartChoice;
  vaultId: string | null;
  scope: AgentProjectScope;
} {
  const stepRaw = searchParams.get("step");
  const step = clampWizardStep(parseInt(stepRaw ?? "1", 10));
  const modeParam = searchParams.get("mode");
  const mode: StartChoice = isStartChoice(modeParam) ? modeParam : "connect_agent";
  const vaultId = searchParams.get("vaultId")?.trim() || null;
  const scopeParam = searchParams.get("scope");
  const scope: AgentProjectScope = isAgentProjectScope(scopeParam) ? scopeParam : "single_agent";
  return { step, mode, vaultId, scope };
}

export function buildWizardSearchParams(input: {
  step: number;
  mode: StartChoice;
  vaultId: string | null;
  scope: AgentProjectScope;
}): string {
  const q = new URLSearchParams();
  q.set("step", String(clampWizardStep(input.step)));
  q.set("mode", input.mode);
  if (input.vaultId) q.set("vaultId", input.vaultId);
  if (input.mode === "agent_project") q.set("scope", input.scope);
  return q.toString();
}

export function readWizardDraft(): WizardDraft {
  if (typeof window === "undefined") return { ...DEFAULT_DRAFT };
  try {
    const raw = sessionStorage.getItem(WIZARD_DRAFT_KEY);
    if (!raw) return { ...DEFAULT_DRAFT };
    const p = JSON.parse(raw) as Partial<WizardDraft>;
    return {
      vaultName: typeof p.vaultName === "string" ? p.vaultName : "",
      squadMission: typeof p.squadMission === "string" ? p.squadMission : "",
      agentProjectScope:
        typeof p.agentProjectScope === "string" && isAgentProjectScope(p.agentProjectScope)
          ? p.agentProjectScope
          : "single_agent",
    };
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

export function writeWizardDraft(draft: WizardDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function readStoredAgentToken(vaultId: string): string | null {
  if (typeof window === "undefined" || !vaultId) return null;
  try {
    return sessionStorage.getItem(TOKEN_PREFIX + vaultId);
  } catch {
    return null;
  }
}

export function writeStoredAgentToken(vaultId: string, token: string): void {
  if (typeof window === "undefined" || !vaultId) return;
  try {
    sessionStorage.setItem(TOKEN_PREFIX + vaultId, token);
  } catch {
    /* ignore */
  }
}

export function clearStoredAgentToken(vaultId: string): void {
  if (typeof window === "undefined" || !vaultId) return;
  try {
    sessionStorage.removeItem(TOKEN_PREFIX + vaultId);
  } catch {
    /* ignore */
  }
}

export function minimalVaultListItem(id: string, nameFallback: string): VaultListItem {
  return {
    id,
    name: nameFallback.trim() || "Vault",
    pathLabel: "",
    kind: "blank",
    managedByProfile: false,
    deletable: true,
    remoteSync: "git",
  };
}
