"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const git_1 = require("./git");
const watcher_1 = require("./watcher");
const commands_1 = require("./commands");
exports.default = {
    name: 'opensync',
    version: '0.1.0',
    hooks: {
        onLoad: async (ctx) => {
            await (0, git_1.initGit)(ctx.workspaceDir);
            await (0, watcher_1.startWatcher)(ctx.workspaceDir, ctx.config.token);
        },
        onUnload: async () => {
            await (0, watcher_1.stopWatcher)();
        },
    },
    commands: {
        '/sync': commands_1.cmdSync,
        '/sync status': commands_1.cmdStatus,
        '/sync rollback': commands_1.cmdRollback,
    },
};
//# sourceMappingURL=index.js.map