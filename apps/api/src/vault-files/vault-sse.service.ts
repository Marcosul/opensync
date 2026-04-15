import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

type SseCb = (cursor: string) => void;

/**
 * Serviço de notificações SSE para vaults.
 *
 * Quando um arquivo é criado/modificado/deletado (vault_file_changes recebe insert),
 * notifica todos os subscribers daquele vault para que façam poll imediato — eliminando
 * o polling cego periódico.
 *
 * Escala horizontal: se REDIS_URL estiver definida, usa Redis pub/sub para fan-out
 * entre múltiplos pods. Sem REDIS_URL, funciona em single-pod (dev e deploy inicial).
 */
@Injectable()
export class VaultSseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VaultSseService.name);

  /** subscribers locais: vaultId → Set de callbacks */
  private readonly localSubs = new Map<string, Set<SseCb>>();

  /** Limite de conexões SSE simultâneas por vault (proteção contra exaustão de fds) */
  private readonly MAX_CONNECTIONS_PER_VAULT = 100;

  private redisPublisher: Redis | null = null;
  private redisSubscriber: Redis | null = null;

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) return;

    try {
      this.redisPublisher = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      this.redisSubscriber = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });
      await this.redisPublisher.connect();
      await this.redisSubscriber.connect();
      await this.redisSubscriber.psubscribe('vault:*:changes');
      this.redisSubscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
        const vaultId = channel.split(':')[1];
        if (vaultId) this.notifyLocal(vaultId, message);
      });
      this.logger.log('Redis SSE pub/sub conectado');
    } catch (err) {
      this.logger.warn(`Redis SSE indisponível, usando fan-out local: ${String(err)}`);
      this.redisPublisher = null;
      this.redisSubscriber = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redisSubscriber?.quit();
      await this.redisPublisher?.quit();
    } catch {
      /* ignorar erros no shutdown */
    }
  }

  /**
   * Chama após cada operação mutante de vault (upsert, delete, snapshot) — fora da transação.
   * @param vaultId UUID do vault
   * @param cursor  ID do último vault_file_change criado (BigInt como string)
   */
  async notify(vaultId: string, cursor: string): Promise<void> {
    this.notifyLocal(vaultId, cursor);
    try {
      await this.redisPublisher?.publish(`vault:${vaultId}:changes`, cursor);
    } catch (err) {
      this.logger.warn(`Falha ao publicar SSE no Redis para vault ${vaultId}: ${String(err)}`);
    }
  }

  /**
   * Registra um callback para eventos de mudança de um vault.
   * Retorna função de cleanup (deve ser chamada ao fechar a conexão SSE).
   */
  subscribe(vaultId: string, callback: SseCb): () => void {
    let subs = this.localSubs.get(vaultId);
    if (!subs) {
      subs = new Set();
      this.localSubs.set(vaultId, subs);
    }
    if (subs.size >= this.MAX_CONNECTIONS_PER_VAULT) {
      throw new Error(`Limite de conexões SSE atingido para vault ${vaultId}`);
    }
    subs.add(callback);
    return () => {
      subs!.delete(callback);
      if (subs!.size === 0) this.localSubs.delete(vaultId);
    };
  }

  /** Fan-out local para os subscribers deste pod */
  private notifyLocal(vaultId: string, cursor: string): void {
    const subs = this.localSubs.get(vaultId);
    if (!subs || subs.size === 0) return;
    for (const cb of subs) {
      try {
        cb(cursor);
      } catch {
        /* subscriber não deve lançar, mas protege o loop */
      }
    }
  }
}
