import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { GiteaService } from '../sync/gitea.service';
import { CreateVaultDto } from './dto/create-vault.dto';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

@Injectable()
export class VaultsService {
  private readonly logger = new Logger(VaultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitea: GiteaService,
  ) {}

  private normalizeName(name: string): string {
    return name.trim().slice(0, 120);
  }

  async createVaultForUser(
    userId: string,
    email: string | undefined,
    dto: CreateVaultDto,
  ) {
    const name = this.normalizeName(dto.name);
    const existing = await this.prisma.vault.findFirst({
      where: { userId, name },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new ConflictException(`Já existe um vault com nome "${name}"`);
    }

    await this.prisma.profile.upsert({
      where: { id: userId },
      update: {
        email: email ?? `${userId}@opensync.local`,
      },
      create: {
        id: userId,
        email: email ?? `${userId}@opensync.local`,
        onboardingGoals: [],
      },
    });

    this.logger.log(
      `${colors.cyan}📦 Criando vault + repo:${colors.reset} user=${userId} name=${name}`,
    );

    const giteaRepo = await this.gitea.createRepoForVault(userId, name);
    try {
      const vault = await this.prisma.vault.create({
        data: {
          userId,
          name,
          description: dto.description?.trim() || null,
          path: dto.path?.trim() || './openclaw',
          giteaRepo,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          path: true,
          giteaRepo: true,
          createdAt: true,
        },
      });

      this.logger.log(
        `${colors.green}✅ Vault criado:${colors.reset} id=${vault.id} repo=${vault.giteaRepo}`,
      );
      return vault;
    } catch (error) {
      this.logger.error(
        `${colors.red}❌ Falha ao persistir vault, iniciando compensação:${colors.reset} repo=${giteaRepo}`,
      );
      await this.gitea.deleteRepo(giteaRepo);
      throw error;
    }
  }

  async listVaultsForUser(userId: string) {
    const vaults = await this.prisma.vault.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        path: true,
        giteaRepo: true,
        createdAt: true,
      },
    });

    this.logger.log(
      `${colors.yellow}📚 Vaults listados:${colors.reset} user=${userId} count=${vaults.length}`,
    );
    return vaults;
  }

  async deleteVaultForUser(userId: string, vaultId: string) {
    const existing = await this.prisma.vault.findFirst({
      where: { id: vaultId, userId, isActive: true },
      select: { id: true, giteaRepo: true },
    });
    if (!existing) {
      return;
    }
    await this.prisma.vault.update({
      where: { id: vaultId },
      data: { isActive: false },
    });
    this.logger.log(
      `${colors.yellow}🗑️ Vault desativado:${colors.reset} id=${vaultId} repo=${existing.giteaRepo}`,
    );
  }
}
