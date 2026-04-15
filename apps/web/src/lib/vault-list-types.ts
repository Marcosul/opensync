export type VaultListItem = {
  id: string;
  /** Workspace no backend (quando vem da API). */
  workspaceId?: string;
  name: string;
  pathLabel: string;
  kind: "openclaw" | "blank";
  managedByProfile: boolean;
  /** Cofre ligado ao agente no perfil nao pode ser apagado pelo explorador. */
  deletable: boolean;
  /** Conteudo sincronizado via SSH a partir da VPS. */
  remoteSync?: "ssh" | "git";
};
