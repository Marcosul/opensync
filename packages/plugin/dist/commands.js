"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cmdSync = cmdSync;
exports.cmdStatus = cmdStatus;
exports.cmdRollback = cmdRollback;
const api_base_1 = require("./api-base");
const git_1 = require("./git");
const sync_1 = require("./sync");
async function cmdSync(ctx) {
    await (0, git_1.commitAll)(ctx.workspaceDir, 'manual: /sync command');
    await (0, sync_1.sync)(ctx.workspaceDir, ctx.token, ctx.vaultId);
    return 'Sync concluído.';
}
async function cmdStatus(_ctx) {
    return 'opensync: ativo e sincronizando.';
}
async function cmdRollback(ctx) {
    const vaultId = (ctx.vaultId ?? process.env.OPENSYNC_VAULT_ID ?? '').trim();
    if (!vaultId) {
        throw new Error('Vault ID ausente para rollback.');
    }
    const base = (0, api_base_1.resolveOpensyncApiBase)();
    await fetch(`${base}/git/${encodeURIComponent(vaultId)}/rollback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitHash: ctx.hash }),
    });
    return `Rollback para ${ctx.hash} solicitado.`;
}
//# sourceMappingURL=commands.js.map