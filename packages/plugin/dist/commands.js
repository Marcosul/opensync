"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cmdSync = cmdSync;
exports.cmdStatus = cmdStatus;
exports.cmdRollback = cmdRollback;
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
    await fetch(`${process.env.OPENSYNC_API_URL ?? 'https://api.opensync.space'}/git/${encodeURIComponent(vaultId)}/rollback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitHash: ctx.hash }),
    });
    return `Rollback para ${ctx.hash} solicitado.`;
}
//# sourceMappingURL=commands.js.map