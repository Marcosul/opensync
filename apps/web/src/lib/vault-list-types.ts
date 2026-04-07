export type VaultListItem = {
  id: string;
  name: string;
  pathLabel: string;
  kind: "openclaw" | "blank";
  managedByProfile: boolean;
  /** Cofre ligado ao agente no perfil nao pode ser apagado pelo explorador. */
  deletable: boolean;
  /** Conteudo sincronizado via SSH a partir da VPS. */
  remoteSync?: "ssh";
};
