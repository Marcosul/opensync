import { hashContent } from "./hash";

type Entry = { contentHash: string; expiresAtMs: number };

/**
 * Evita loop watcher → sync: após gravar um ficheiro vindo do remoto, o watcher dispara;
 * se o conteúdo for exactamente o que acabámos de escrever, o próximo upload deve ser ignorado.
 */
export class SuppressedWrites {
  private readonly map = new Map<string, Entry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 8000) {
    this.ttlMs = ttlMs;
  }

  /** Registar antes de `writeFile` com conteúdo UTF-8 que vai ser gravado. */
  register(vaultRelativePath: string, utf8Content: string): void {
    const key = normalizePath(vaultRelativePath);
    this.prune();
    this.map.set(key, { contentHash: hashContent(utf8Content), expiresAtMs: Date.now() + this.ttlMs });
  }

  /**
   * Se o ficheiro no disco corresponde a uma escrita suprimida recente, remove a entrada e devolve true
   * (o caller deve tratar como no-op / não re-enfileirar upload).
   */
  consumeIfMatch(vaultRelativePath: string, utf8Content: string): boolean {
    const key = normalizePath(vaultRelativePath);
    this.prune();
    const e = this.map.get(key);
    if (!e) return false;
    if (e.contentHash !== hashContent(utf8Content)) return false;
    this.map.delete(key);
    return true;
  }

  clearPath(vaultRelativePath: string): void {
    this.map.delete(normalizePath(vaultRelativePath));
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.map) {
      if (v.expiresAtMs < now) this.map.delete(k);
    }
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}
