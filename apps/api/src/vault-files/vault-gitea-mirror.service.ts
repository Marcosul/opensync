import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { VaultGitSyncService } from '../sync/vault-git-sync.service';
import { VaultFilesService } from './vault-files.service';
import { VaultSseService } from './vault-sse.service';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

/**
 * Debounce de 5s por vault: agrupa edições rápidas antes de fazer push no Gitea.
 * Evita N pushes Git para N edições sequenciais em curto espaço de tempo.
 */
const MIRROR_DEBOUNCE_MS = 5_000;

/**
 * Sweep periódico de segurança (5 min): garante que vaults criados após onModuleInit
 * e eventuais eventos SSE perdidos sejam espelhados.
 */
const MIRROR_SWEEP_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class VaultGiteaMirrorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VaultGiteaMirrorService.name);

  /** vaultId → { giteaRepo, unsubscribeFn } */
  private readonly watchedVaults = new Map<string, { giteaRepo: string; unsub: () => void }>();

  /** vaultId → timer de debounce pendente */
  private readonly pendingMirrors = new Map<string, ReturnType<typeof setTimeout>>();

  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultFiles: VaultFilesService,
    private readonly vaultGitSync: VaultGitSyncService,
    private readonly vaultSse: VaultSseService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Subscrever todos os vaults ativos
    const vaults = await this.prisma.vault.findMany({
      where: { isActive: true },
      select: { id: true, giteaRepo: true },
    });
    for (const v of vaults) {
      this.watchVault(v.id, v.giteaRepo);
    }

    // Sweep periódico: cobre vaults novos e eventos perdidos
    this.sweepTimer = setInterval(() => {
      void this.runSweep();
    }, MIRROR_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const { unsub } of this.watchedVaults.values()) {
      unsub();
    }
    for (const timer of this.pendingMirrors.values()) {
      clearTimeout(timer);
    }
    this.watchedVaults.clear();
    this.pendingMirrors.clear();
  }

  /**
   * Registra um vault para receber notificações SSE e disparar mirror com debounce.
   * Chamado no onModuleInit e quando um novo vault é criado (VaultsService).
   */
  watchVault(vaultId: string, giteaRepo: string): void {
    if (this.watchedVaults.has(vaultId)) return; // já registrado
    const unsub = this.vaultSse.subscribe(vaultId, () => {
      this.scheduleMirror(vaultId, giteaRepo);
    });
    this.watchedVaults.set(vaultId, { giteaRepo, unsub });
  }

  private scheduleMirror(vaultId: string, giteaRepo: string): void {
    const existing = this.pendingMirrors.get(vaultId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pendingMirrors.delete(vaultId);
      void this.mirrorVault(vaultId, giteaRepo);
    }, MIRROR_DEBOUNCE_MS);
    this.pendingMirrors.set(vaultId, timer);
  }

  /** Mirror de um vault específico: verifica se há mudanças e faz push no Gitea */
  async mirrorVault(vaultId: string, giteaRepo: string): Promise<void> {
    const maxId = await this.vaultFiles.maxChangeId(vaultId);
    const state = await this.prisma.vaultGiteaMirrorState.findUnique({
      where: { vaultId },
    });
    const last = state?.lastMirroredChangeId ?? 0n;
    if (maxId <= last) return;

    try {
      await this.vaultGitSync.pushMirrorTextFilesStreamed(giteaRepo, () =>
        this.vaultFiles.streamActiveVaultFilesForMirror(vaultId),
      );
      await this.prisma.vaultGiteaMirrorState.upsert({
        where: { vaultId },
        create: { vaultId, lastMirroredChangeId: maxId },
        update: { lastMirroredChangeId: maxId },
      });
      this.logger.log(
        `${colors.cyan}🪞 Mirror atualizado${colors.reset} vault=${vaultId} change=${maxId}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}❌ Mirror vault ${vaultId}:${colors.reset} ${msg}`,
      );
    }
  }

  /**
   * Sweep de segurança: verifica todos os vaults ativos.
   * Cobre vaults criados após onModuleInit e eventos SSE perdidos.
   */
  async runSweep(): Promise<void> {
    const vaults = await this.prisma.vault.findMany({
      where: { isActive: true },
      select: { id: true, giteaRepo: true },
    });

    for (const v of vaults) {
      // Registrar vaults novos que não foram vistos no onModuleInit
      if (!this.watchedVaults.has(v.id)) {
        this.watchVault(v.id, v.giteaRepo);
      }
      // Verificar se há pendências não espelhadas
      this.scheduleMirror(v.id, v.giteaRepo);
    }
  }

  /** @deprecated Use mirrorVault + runSweep. Mantido para retrocompatibilidade. */
  async runMirrorTick(): Promise<void> {
    return this.runSweep();
  }
}
