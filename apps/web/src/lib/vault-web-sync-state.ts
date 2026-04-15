import { hashContent } from "@opensync/sync";

export type WebFileSyncEntry = {
  /** Versão remota do arquivo no servidor (string do campo `version` do banco) */
  remoteVersion: string;
  /** Hash SHA-256 do conteúdo na última sincronização bem-sucedida */
  lastSyncedHash: string;
};

/**
 * Mapa em memória de estado de sincronização por arquivo.
 * Mantém a versão remota e hash do último sync para permitir:
 * 1. Detecção de conflito (versão remota divergiu → 409)
 * 2. Deduplicação (conteúdo igual ao último sync → não envia)
 */
export class WebSyncStateMap {
  private readonly map = new Map<string, WebFileSyncEntry>();

  /**
   * Inicializa o mapa com as entradas do tree remoto.
   * Chamado após carregar o tree do servidor (GET /git/tree).
   * `lastSyncedHash` começa vazio; será preenchido no primeiro upsert bem-sucedido.
   */
  initFromTree(entries: Array<{ path: string; version: string }>): void {
    for (const e of entries) {
      const existing = this.map.get(e.path);
      // Preserva lastSyncedHash se a versão não mudou (evita invalidar estado local)
      this.map.set(e.path, {
        remoteVersion: e.version,
        lastSyncedHash: existing?.remoteVersion === e.version ? (existing.lastSyncedHash) : "",
      });
    }
  }

  /** Atualiza o mapa após upsert bem-sucedido */
  afterUpsert(path: string, version: string, content: string): void {
    this.map.set(path, {
      remoteVersion: version,
      lastSyncedHash: hashContent(content),
    });
  }

  get(path: string): WebFileSyncEntry | undefined {
    return this.map.get(path);
  }

  /**
   * Retorna true se o conteúdo atual é idêntico ao último conteúdo sincronizado.
   * Usado para evitar upserts desnecessários.
   */
  isClean(path: string, currentContent: string): boolean {
    const entry = this.map.get(path);
    if (!entry || !entry.lastSyncedHash) return false;
    return entry.lastSyncedHash === hashContent(currentContent);
  }

  /** Remove o estado de um arquivo (ex.: após delete bem-sucedido) */
  delete(path: string): void {
    this.map.delete(path);
  }

  /** Retorna todas as versões remotas conhecidas (para inicializar o tree) */
  getAll(): Map<string, WebFileSyncEntry> {
    return new Map(this.map);
  }
}
