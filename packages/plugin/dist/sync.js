"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sync = sync;
const api_base_1 = require("./api-base");
const workspace_files_1 = require("./workspace-files");
function resolveVaultId(vaultId) {
    const resolved = (vaultId ?? process.env.OPENSYNC_VAULT_ID ?? "").trim();
    if (!resolved) {
        throw new Error("Vault ID ausente. Defina OPENSYNC_VAULT_ID ou ctx.config.vaultId.");
    }
    return resolved;
}
async function sync(workspaceDir, token, vaultId) {
    const resolvedVaultId = resolveVaultId(vaultId);
    const base = (0, api_base_1.resolveOpensyncApiBase)();
    const files = await (0, workspace_files_1.collectWorkspaceTextFiles)(workspaceDir);
    if (Object.keys(files).length === 0) {
        throw new Error("Nenhum ficheiro de texto no workspace para enviar. Adicione notas ou ficheiros .md e tente de novo.");
    }
    const res = await fetch(`${base}/agent/vaults/${encodeURIComponent(resolvedVaultId)}/files/snapshot`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ files }),
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(text || `Push falhou (${res.status})`);
    }
}
//# sourceMappingURL=sync.js.map