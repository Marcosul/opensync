import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { VaultsService } from '../vaults/vaults.service';
import { hashAgentBearerToken } from '../common/agent-token.util';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vaults: VaultsService,
  ) {}

  async getMe(userId: string, email: string) {
    return { userId, email };
  }

  async listVaults(userId: string) {
    const vaultList = await this.prisma.vault.findMany({
      where: {
        isActive: true,
        workspace: { userId },
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        workspace: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return vaultList.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description ?? undefined,
      workspaceName: v.workspace.name,
      createdAt: v.createdAt,
    }));
  }

  async createVault(userId: string, email: string, name: string) {
    // Delega ao VaultsService que já tem toda a lógica de Gitea + workspace
    return this.vaults.createVaultForUser(userId, email, { name });
  }

  async createSyncToken(userId: string, vaultId: string) {
    // Delega ao VaultsService
    return this.vaults.createAgentApiTokenForUser(userId, vaultId);
  }
}
