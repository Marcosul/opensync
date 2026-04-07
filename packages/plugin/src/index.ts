import { initGit } from './git';
import { startWatcher, stopWatcher } from './watcher';
import { cmdSync, cmdStatus, cmdRollback } from './commands';

export default {
  name: 'opensync',
  version: '0.1.0',
  hooks: {
    onLoad: async (ctx: {
      workspaceDir: string;
      config: { token: string; vaultId?: string };
    }) => {
      await initGit(ctx.workspaceDir);
      await startWatcher(ctx.workspaceDir, ctx.config.token, ctx.config.vaultId);
    },
    onUnload: async () => {
      await stopWatcher();
    },
  },
  commands: {
    '/sync': cmdSync,
    '/sync status': cmdStatus,
    '/sync rollback': cmdRollback,
  },
};
