import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { hashAgentBearerToken, parseBearerToken } from '../common/agent-token.util';
import { VaultGitSyncService } from './vault-git-sync.service';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
};

type AgentVaultRow = {
  id: string;
  giteaRepo: string;
  name: string;
};

@Controller('git')
export class SyncController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultGitSync: VaultGitSyncService,
  ) {}

  private async resolveVaultWithAgentToken(
    vaultId: string,
    authorization: string | undefined,
  ): Promise<{ agentId: string; vault: AgentVaultRow }> {
    const bearer = parseBearerToken(authorization);
    if (!bearer) {
      throw new UnauthorizedException('Cabeçalho Authorization: Bearer obrigatório');
    }
    const tokenHash = hashAgentBearerToken(bearer);
    const row = await this.prisma.agent.findFirst({
      where: {
        vaultId,
        tokenHash,
      },
      select: {
        id: true,
        vault: {
          select: {
            id: true,
            giteaRepo: true,
            name: true,
          },
        },
      },
    });
    if (!row?.vault) {
      throw new UnauthorizedException('Token ou vault inválidos');
    }
    return { agentId: row.id, vault: row.vault };
  }

  @Post(':vaultId/push')
  async push(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { files?: Record<string, string> },
  ) {
    const { vault } = await this.resolveVaultWithAgentToken(vaultId, authorization);
    const files = body?.files;
    if (
      files === undefined ||
      files === null ||
      typeof files !== 'object' ||
      Array.isArray(files) ||
      Object.keys(files).length === 0
    ) {
      throw new BadRequestException(
        'Corpo JSON obrigatorio: { "files": { "caminho/relativo.md": "conteudo utf-8", ... } }. ' +
          'Um push sem ficheiros nao atualiza o Gitea.',
      );
    }
    console.log(
      `${colors.cyan}🔁 Sync push recebido${colors.reset} vault=${vault.id} repo=${vault.giteaRepo} files=${Object.keys(files).length}`,
    );
    const { commitHash } = await this.vaultGitSync.pushTextFiles(
      vault.giteaRepo,
      files,
    );
    return {
      ok: true as const,
      vaultId: vault.id,
      repo: vault.giteaRepo,
      commitHash,
    };
  }

  @Get(':vaultId/pull')
  async pull(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const { vault } = await this.resolveVaultWithAgentToken(vaultId, authorization);
    return { ok: true as const, vaultId: vault.id, repo: vault.giteaRepo };
  }

  @Post(':vaultId/rollback')
  async rollback(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { commitHash?: string },
  ) {
    const { vault } = await this.resolveVaultWithAgentToken(vaultId, authorization);
    console.log(
      `${colors.cyan}⏪ Rollback solicitado${colors.reset} vault=${vault.id} hash=${body.commitHash ?? 'n/a'}`,
    );
    return { ok: true as const, vaultId: vault.id, commitHash: body.commitHash ?? null };
  }
}
