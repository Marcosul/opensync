import { cmdSync, cmdStatus, cmdRollback } from './commands';
declare const _default: {
    name: string;
    version: string;
    hooks: {
        onLoad: (ctx: {
            workspaceDir: string;
            config: {
                token: string;
                vaultId?: string;
            };
        }) => Promise<void>;
        onUnload: () => Promise<void>;
    };
    commands: {
        '/sync': typeof cmdSync;
        '/sync status': typeof cmdStatus;
        '/sync rollback': typeof cmdRollback;
    };
};
export default _default;
