"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sync = sync;
const api_base_1 = require("./api-base");
function resolveVaultId(vaultId) {
    const resolved = (vaultId ?? process.env.OPENSYNC_VAULT_ID ?? '').trim();
    if (!resolved) {
        throw new Error('Vault ID ausente. Defina OPENSYNC_VAULT_ID ou ctx.config.vaultId.');
    }
    return resolved;
}
async function sync(workspaceDir, token, vaultId) {
    const resolvedVaultId = resolveVaultId(vaultId);
    const base = (0, api_base_1.resolveOpensyncApiBase)();
    await fetch(`${base}/git/${encodeURIComponent(resolvedVaultId)}/push`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'x-opensync-user-id': process.env.OPENSYNC_USER_ID ?? '',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspaceDir }),
    });
}
//# sourceMappingURL=sync.js.map