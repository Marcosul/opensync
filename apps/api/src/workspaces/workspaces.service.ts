import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceAccessService, workspaceWhereForUser } from './workspace-access.service';
import { defaultWorkspaceNameFromEmail } from './workspace-default-name';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  private normalizeName(name: string): string {
    return name.trim().slice(0, 120);
  }

  private isLegacySchemaError(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return false;
    }
    const code = (error as { code?: string }).code;
    return code === 'P2021' || code === 'P2022';
  }

  /**
   * Garante um workspace para o utilizador: reutiliza o primeiro (ex.: trigger no Supabase)
   * ou cria um com nome "{emailLocal}'s Workspace" se ainda não existir nenhum.
   */
  async ensureDefaultWorkspace(userId: string): Promise<string> {
    const existing = await this.prisma.workspace.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const name = defaultWorkspaceNameFromEmail(profile?.email ?? null);
    const created = await this.prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: { userId, name },
        select: { id: true },
      });
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_profileId: { workspaceId: ws.id, profileId: userId },
        },
        create: {
          workspaceId: ws.id,
          profileId: userId,
          role: WorkspaceRole.ADMIN,
          status: WorkspaceMemberStatus.ACTIVE,
        },
        update: {
          role: WorkspaceRole.ADMIN,
          status: WorkspaceMemberStatus.ACTIVE,
        },
      });
      return ws;
    });
    this.logger.log(
      `${colors.yellow}📁 Workspace inicial criado (fallback):${colors.reset} user=${userId} id=${created.id} name=${name}`,
    );
    return created.id;
  }

  async resolveWorkspaceForCreate(
    userId: string,
    workspaceId: string | undefined,
  ): Promise<string> {
    const trimmed = workspaceId?.trim();
    if (trimmed) {
      const w = await this.prisma.workspace.findFirst({
        where: { id: trimmed, ...workspaceWhereForUser(userId) },
        select: { id: true },
      });
      if (!w) {
        throw new NotFoundException('Workspace não encontrado');
      }
      await this.access.requireEditorOrAdmin(userId, w.id);
      return w.id;
    }
    return this.ensureDefaultWorkspace(userId);
  }

  async listForUser(userId: string) {
    let items: Array<{
      id: string;
      name: string;
      createdAt: Date;
      userId: string;
      _count: { vaults: number };
    }>;
    try {
      items = await this.prisma.workspace.findMany({
        where: workspaceWhereForUser(userId),
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          userId: true,
          _count: { select: { vaults: true } },
        },
      });
    } catch (error) {
      if (!this.isLegacySchemaError(error)) {
        throw error;
      }
      this.logger.warn(
        `${colors.yellow}⚠️ Workspace em modo compatibilidade de schema:${colors.reset} user=${userId} code=${(error as { code?: string }).code ?? 'unknown'}`,
      );
      items = await this.prisma.workspace.findMany({
        where: {
          OR: [
            { userId },
            {
              members: {
                some: { profileId: userId, status: WorkspaceMemberStatus.ACTIVE },
              },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          userId: true,
          _count: { select: { vaults: true } },
        },
      });
    }
    this.logger.log(
      `${colors.cyan}📂 Workspaces listados:${colors.reset} user=${userId} count=${items.length}`,
    );
    return items.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt,
      vaultCount: w._count.vaults,
      isOwner: w.userId === userId,
    }));
  }

  async createForUser(userId: string, dto: CreateWorkspaceDto) {
    const name = this.normalizeName(dto.name);
    try {
      const ws = await this.prisma.$transaction(async (tx) => {
        const created = await tx.workspace.create({
          data: { userId, name },
          select: { id: true, name: true, createdAt: true, userId: true },
        });
        await tx.workspaceMember.create({
          data: {
            workspaceId: created.id,
            profileId: userId,
            role: WorkspaceRole.ADMIN,
            status: WorkspaceMemberStatus.ACTIVE,
          },
        });
        return created;
      });
      this.logger.log(
        `${colors.green}✅ Workspace criado:${colors.reset} user=${userId} id=${ws.id} name=${ws.name}`,
      );
      return { ...ws, isOwner: true as const };
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? (e as { code?: string }).code
          : undefined;
      if (code === 'P2002') {
        throw new ConflictException(`Já existe um workspace com o nome "${name}"`);
      }
      throw e;
    }
  }

  async getByIdForUser(userId: string, workspaceId: string) {
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, ...workspaceWhereForUser(userId) },
      select: { id: true, name: true, createdAt: true, userId: true },
    });
    if (!ws) {
      throw new NotFoundException('Workspace não encontrado');
    }
    return { ...ws, isOwner: ws.userId === userId };
  }

  /**
   * Garante o workspace Default e devolve o registro (para o onboarding).
   */
  async ensureDefaultWithInfo(userId: string) {
    const id = await this.ensureDefaultWorkspace(userId);
    return this.getByIdForUser(userId, id);
  }

  async updateForUser(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    await this.access.requireAdmin(userId, workspaceId);
    const name = this.normalizeName(dto.name);
    try {
      const ws = await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { name },
        select: { id: true, name: true, createdAt: true, userId: true },
      });
      this.logger.log(
        `${colors.green}✏️ Workspace atualizado:${colors.reset} user=${userId} id=${ws.id} name=${ws.name}`,
      );
      return { ...ws, isOwner: ws.userId === userId };
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? (e as { code?: string }).code
          : undefined;
      if (code === 'P2002') {
        throw new ConflictException(`Já existe um workspace com o nome "${name}"`);
      }
      throw e;
    }
  }

  async deleteForUser(userId: string, workspaceId: string) {
    await this.access.requireAdmin(userId, workspaceId);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
    this.logger.log(
      `${colors.yellow}🗑️ Workspace arquivado (soft delete):${colors.reset} user=${userId} id=${workspaceId}`,
    );
    return { ok: true as const };
  }
}
