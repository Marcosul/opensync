export declare function cmdSync(ctx: {
    workspaceDir: string;
    token: string;
    vaultId?: string;
}): Promise<string>;
export declare function cmdStatus(_ctx: {
    workspaceDir: string;
}): Promise<string>;
export declare function cmdRollback(ctx: {
    workspaceDir: string;
    token: string;
    hash: string;
    vaultId?: string;
}): Promise<string>;
