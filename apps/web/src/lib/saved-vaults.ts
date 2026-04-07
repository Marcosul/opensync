import type { VaultListItem } from "@/lib/vault-list-types";

export type SavedVaultRecord = {
  id: string;
  name: string;
  kind: "empty";
  createdAt: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function parseSavedVaults(raw: unknown): SavedVaultRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedVaultRecord[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name : "";
    const kind = item.kind === "empty" ? "empty" : null;
    const createdAt = typeof item.createdAt === "string" ? item.createdAt : "";
    if (!id || !name || !kind || !createdAt) continue;
    out.push({ id, name, kind, createdAt });
  }
  return out;
}

export function savedVaultToListItem(s: SavedVaultRecord): VaultListItem {
  return {
    id: s.id,
    name: s.name,
    pathLabel: "Vault vazio · guardado na sua conta",
    kind: "blank",
    managedByProfile: true,
    deletable: true,
  };
}

export function mergeSavedVaultsFromSources(
  profileSaved: unknown,
  metadataSaved: unknown,
): SavedVaultRecord[] {
  const fromProfile = parseSavedVaults(profileSaved);
  if (fromProfile.length > 0) return fromProfile;
  return parseSavedVaults(metadataSaved);
}
