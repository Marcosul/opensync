import {
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
  constructor(private readonly prisma: PrismaService) {}

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
  ) {
    const { vault } = await this.resolveVaultWithAgentToken(vaultId, authorization);
    console.log(
      `${colors.cyan}🔁 Sync push recebido${colors.reset} vault=${vault.id} repo=${vault.giteaRepo}`,
    );
    return { ok: true as const, vaultId: vault.id, repo: vault.giteaRepo };
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
