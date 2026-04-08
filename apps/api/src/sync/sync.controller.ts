import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
};

@Controller('git')
export class SyncController {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeUserId(userId: string | undefined): string | null {
    const normalized = userId?.trim();
    return normalized || null;
  }

  @Post(':vaultId/push')
  async push(
    @Param('vaultId') vaultId: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
  ) {
    const uid = this.normalizeUserId(userId);
    const vault = await this.prisma.vault.findFirst({
      where: uid
        ? { id: vaultId, workspace: { userId: uid } }
        : { id: vaultId },
      select: { id: true, giteaRepo: true, name: true },
    });
    if (!vault) {
      return { ok: false, error: 'Vault não encontrado' };
    }
    // Placeholder while git proxy implementation is incrementally completed.
    console.log(
      `${colors.cyan}🔁 Sync push recebido${colors.reset} vault=${vault.id} repo=${vault.giteaRepo}`,
    );
    return { ok: true, vaultId: vault.id, repo: vault.giteaRepo };
  }

  @Get(':vaultId/pull')
  async pull(
    @Param('vaultId') vaultId: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
  ) {
    const uid = this.normalizeUserId(userId);
    const vault = await this.prisma.vault.findFirst({
      where: uid
        ? { id: vaultId, workspace: { userId: uid } }
        : { id: vaultId },
      select: { id: true, giteaRepo: true },
    });
    if (!vault) {
      return { ok: false, error: 'Vault não encontrado' };
    }
    return { ok: true, vaultId: vault.id, repo: vault.giteaRepo };
  }

  @Post(':vaultId/rollback')
  async rollback(
    @Param('vaultId') vaultId: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: { commitHash?: string },
  ) {
    const uid = this.normalizeUserId(userId);
    const vault = await this.prisma.vault.findFirst({
      where: uid
        ? { id: vaultId, workspace: { userId: uid } }
        : { id: vaultId },
      select: { id: true, giteaRepo: true },
    });
    if (!vault) {
      return { ok: false, error: 'Vault não encontrado' };
    }
    console.log(
      `${colors.cyan}⏪ Rollback solicitado${colors.reset} vault=${vault.id} hash=${body.commitHash ?? 'n/a'}`,
    );
    return { ok: true, vaultId: vault.id, commitHash: body.commitHash ?? null };
  }
}
