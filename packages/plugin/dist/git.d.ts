export declare function initGit(workspaceDir: string): Promise<void>;
export declare function commitAll(workspaceDir: string, message: string): Promise<string>;
export declare function pushToApi(workspaceDir: string, apiUrl: string, token: string): Promise<void>;
