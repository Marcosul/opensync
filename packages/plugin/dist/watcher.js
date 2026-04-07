"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWatcher = startWatcher;
exports.stopWatcher = stopWatcher;
const chokidar_1 = __importDefault(require("chokidar"));
const git_1 = require("./git");
const sync_1 = require("./sync");
let watcher = null;
let debounceTimer = null;
async function startWatcher(workspaceDir, token, vaultId) {
    watcher = chokidar_1.default.watch(workspaceDir, {
        ignored: /(^|[/\\])\..|(^|[/\\])node_modules/,
        persistent: true,
        ignoreInitial: true,
    });
    watcher.on('all', (event, filePath) => {
        if (debounceTimer)
            clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            const filename = filePath.replace(workspaceDir, '').replace(/^\//, '');
            await (0, git_1.commitAll)(workspaceDir, `auto: ${filename} ${event}`);
            await (0, sync_1.sync)(workspaceDir, token, vaultId);
        }, 1000);
    });
}
async function stopWatcher() {
    if (debounceTimer)
        clearTimeout(debounceTimer);
    await watcher?.close();
    watcher = null;
}
//# sourceMappingURL=watcher.js.map