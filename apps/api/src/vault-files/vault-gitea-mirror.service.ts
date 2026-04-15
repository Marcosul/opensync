import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { VaultGitSyncService } from '../sync/vault-git-sync.service';
import { VaultFilesService } from './vault-files.service';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const MIRROR_INTERVAL_MS = 30_000;

@Injectable()
export class VaultGiteaMirrorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VaultGiteaMirrorService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultFiles: VaultFilesService,
    private readonly vaultGitSync: VaultGitSyncService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runMirrorTick().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `${colors.yellow}⚠️ Mirror tick falhou:${colors.reset} ${msg}`,
        );
      });
    }, MIRROR_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runMirrorTick(): Promise<void> {
    const vaults = await this.prisma.vault.findMany({
      where: { isActive: true },
      select: { id: true, giteaRepo: true },
    });

    for (const v of vaults) {
      const maxId = await this.vaultFiles.maxChangeId(v.id);
      const state = await this.prisma.vaultGiteaMirrorState.findUnique({
        where: { vaultId: v.id },
      });
      const last = state?.lastMirroredChangeId ?? 0n;
      if (maxId <= last) continue;

      try {
        await this.vaultGitSync.pushMirrorTextFilesStreamed(v.giteaRepo, () =>
          this.vaultFiles.streamActiveVaultFilesForMirror(v.id),
        );
        await this.prisma.vaultGiteaMirrorState.upsert({
          where: { vaultId: v.id },
          create: { vaultId: v.id, lastMirroredChangeId: maxId },
          update: { lastMirroredChangeId: maxId },
        });
        this.logger.log(
          `${colors.cyan}🪞 Mirror atualizado${colors.reset} vault=${v.id} change=${maxId}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `${colors.red}❌ Mirror vault ${v.id}:${colors.reset} ${msg}`,
        );
      }
    }
  }
}
