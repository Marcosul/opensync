"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sync = sync;
const API_URL = process.env.OPENSYNC_API_URL ?? 'https://api.opensync.space';
async function sync(workspaceDir, token) {
    await fetch(`${API_URL}/git/push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceDir }),
    });
}
//# sourceMappingURL=sync.js.map