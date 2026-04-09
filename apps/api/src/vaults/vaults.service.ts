import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { hashAgentBearerToken } from '../common/agent-token.util';
import { PrismaService } from '../common/prisma.service';
import { GiteaService } from '../sync/gitea.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { generateOpensshEd25519KeyPair } from '../sync/openssh-keygen.util';
import { CreateVaultDto } from './dto/create-vault.dto';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
};

@Injectable()
export class VaultsService {
  private readonly logger = new Logger(VaultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitea: GiteaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  private normalizeName(name: string): string {
    return name.trim().slice(0, 120);
  }

  private vaultWhereUser(userId: string) {
    return {
      workspace: { userId },
    } as const;
  }

  /** Username da org Gitea: estável por workspace (ws + uuid sem hífens). */
  private workspaceGiteaOrgSlug(workspaceId: string): string {
    return `ws${workspaceId.replace(/-/g, '')}`;
  }

  private async resolveGiteaOrgForWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<string> {
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
      select: { id: true, name: true, giteaOrg: true },
    });
    if (!ws) {
      throw new NotFoundException('Workspace não encontrado');
    }
    if (ws.giteaOrg) {
      return ws.giteaOrg;
    }
    const slug = this.workspaceGiteaOrgSlug(ws.id);
    await this.gitea.ensureOrg({ username: slug, fullName: ws.name });
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { giteaOrg: slug },
    });
    return slug;
  }

  async createVaultForUser(
    userId: string,
    email: string | undefined,
    dto: CreateVaultDto,
  ) {
    const name = this.normalizeName(dto.name);
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

    const workspaceId = await this.workspaces.resolveWorkspaceForCreate(
      userId,
      dto.workspaceId,
    );

    const existing = await this.prisma.vault.findFirst({
      where: { workspaceId, name },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new ConflictException(`Já existe um vault com nome "${name}" neste workspace`);
    }

    this.logger.log(
      `${colors.cyan}📦 Criando vault + repo:${colors.reset} user=${userId} workspace=${workspaceId} name=${name}`,
    );

    const giteaOrg = await this.resolveGiteaOrgForWorkspace(userId, workspaceId);
    const giteaRepo = await this.gitea.createRepoForVault(name, giteaOrg, workspaceId);
    try {
      const vault = await this.prisma.vault.create({
        data: {
          workspaceId,
          name,
          description: dto.description?.trim() || null,
          path: dto.path?.trim() || './openclaw',
          giteaRepo,
          isActive: true,
        },
        select: {
          id: true,
          workspaceId: true,
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

  async getVaultForUser(
    userId: string,
    vaultId: string,
  ): Promise<{ id: string; giteaRepo: string } | null> {
    return this.prisma.vault.findFirst({
      where: {
        id: vaultId,
        isActive: true,
        ...this.vaultWhereUser(userId),
      },
      select: { id: true, giteaRepo: true },
    });
  }

  /**
   * Gera par SSH, regista deploy key no Gitea (escrita), guarda só o id Gitea na base.
   * A chave privada devolvida deve ser mostrada uma vez ao utilizador (VPS OpenClaw).
   */
  async createAgentDeployKeyForUser(userId: string, vaultId: string) {
    const vault = await this.prisma.vault.findFirst({
      where: {
        id: vaultId,
        isActive: true,
        ...this.vaultWhereUser(userId),
      },
      select: { id: true, giteaRepo: true, agentDeployKeyGiteaId: true },
    });
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }

    if (vault.agentDeployKeyGiteaId != null) {
      try {
        await this.gitea.deleteDeployKey(
          vault.giteaRepo,
          vault.agentDeployKeyGiteaId,
        );
      } catch (err) {
        this.logger.warn(
          `${colors.yellow}⚠️ Não foi possível revogar deploy key antiga (seguindo):${colors.reset} ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    let pair: ReturnType<typeof generateOpensshEd25519KeyPair>;
    try {
      pair = generateOpensshEd25519KeyPair(`opensync-vault-${vault.id.slice(0, 8)}`);
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}❌ ssh-keygen falhou:${colors.reset} ${hint}`,
      );
      throw new InternalServerErrorException(
        'Falha ao gerar chave SSH. Na imagem da API é necessário openssh-client (ssh-keygen).',
      );
    }

    const created = await this.gitea.addDeployKey(vault.giteaRepo, {
      title: `OpenSync agent ${vault.id.slice(0, 8)}`,
      key: pair.publicKeyLine,
      readOnly: false,
    });

    await this.prisma.vault.update({
      where: { id: vaultId },
      data: { agentDeployKeyGiteaId: created.id },
    });

    const cloneSshUrl = this.gitea.buildSshCloneUrl(vault.giteaRepo);

    this.logger.log(
      `${colors.green}✅ Deploy key Gitea criada:${colors.reset} vault=${vaultId} keyId=${created.id} repo=${vault.giteaRepo}`,
    );

    return {
      vaultId: vault.id,
      giteaRepo: vault.giteaRepo,
      giteaDeployKeyId: created.id,
      fingerprint: created.fingerprint ?? null,
      publicKey: pair.publicKeyLine,
      privateKeyOpenssh: pair.privateKeyPem,
      cloneSshUrl,
      instructions:
        'Guarde a chave privada na VPS (chmod 600). Use GIT_SSH_COMMAND com ssh -i ... e IdentitiesOnly=yes. ' +
        `Clone: git clone ${cloneSshUrl}. Cron OpenClaw: ver docs/dev/openclaw-agent-sync.md`,
    };
  }

  async deleteAgentDeployKeyForUser(userId: string, vaultId: string) {
    const vault = await this.prisma.vault.findFirst({
      where: {
        id: vaultId,
        isActive: true,
        ...this.vaultWhereUser(userId),
      },
      select: { id: true, giteaRepo: true, agentDeployKeyGiteaId: true },
    });
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }
    if (vault.agentDeployKeyGiteaId == null) {
      return { ok: true as const, removed: false };
    }
    await this.gitea.deleteDeployKey(vault.giteaRepo, vault.agentDeployKeyGiteaId);
    await this.prisma.vault.update({
      where: { id: vaultId },
      data: { agentDeployKeyGiteaId: null },
    });
    this.logger.log(
      `${colors.green}🗑️ Deploy key revogada:${colors.reset} vault=${vaultId} repo=${vault.giteaRepo}`,
    );
    return { ok: true as const, removed: true };
  }

  /**
   * Cria credencial de agente (app Ubuntu / integrações): token mostrado uma vez; guarda-se apenas SHA-256.
   */
  async createAgentApiTokenForUser(userId: string, vaultId: string) {
    const vault = await this.prisma.vault.findFirst({
      where: {
        id: vaultId,
        isActive: true,
        ...this.vaultWhereUser(userId),
      },
      select: { id: true },
    });
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }

    const raw = randomBytes(32).toString('base64url');
    const token = `osk_${raw}`;
    const tokenHash = hashAgentBearerToken(token);

    const agent = await this.prisma.agent.create({
      data: {
        vaultId: vault.id,
        name: 'OpenSync agent',
        tokenHash,
      },
      select: { id: true },
    });

    this.logger.log(
      `${colors.magenta}🔑 API token de agente criado:${colors.reset} vault=${vaultId} agent=${agent.id}`,
    );

    return {
      token,
      vaultId: vault.id,
      agentId: agent.id,
    };
  }

  async listVaultsForUser(userId: string) {
    const vaults = await this.prisma.vault.findMany({
      where: { isActive: true, ...this.vaultWhereUser(userId) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        workspaceId: true,
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
      where: {
        id: vaultId,
        isActive: true,
        ...this.vaultWhereUser(userId),
      },
      select: { id: true, giteaRepo: true },
    });
    if (!existing) {
      return;
    }

    await this.prisma.vault.update({
      where: { id: vaultId },
      data: { isActive: false },
    });

    try {
      await this.gitea.deleteRepo(existing.giteaRepo);
    } catch (err) {
      await this.prisma.vault.update({
        where: { id: vaultId },
        data: { isActive: true },
      });
      this.logger.error(
        `${colors.red}↩️ Vault reativado (Gitea falhou ao apagar repo):${colors.reset} id=${vaultId}`,
      );
      throw err;
    }

    this.logger.log(
      `${colors.green}🗑️ Vault desativado + repo Gitea apagado:${colors.reset} id=${vaultId} repo=${existing.giteaRepo}`,
    );
  }
}
