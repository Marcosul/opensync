import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WorkspaceMemberStatus,
  WorkspaceRole,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/** Filtro Prisma: workspaces acessíveis (dono ou membro ativo). */
export function workspaceWhereForUser(userId: string): Prisma.WorkspaceWhereInput {
  return {
    OR: [
      { userId },
      {
        members: {
          some: { profileId: userId, status: WorkspaceMemberStatus.ACTIVE },
        },
      },
    ],
  };
}

@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dono do workspace conta como ADMIN mesmo antes de existir linha em workspace_members.
   */
  async getRoleInWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceRole | null> {
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: { userId: true },
    });
    if (!ws) return null;
    if (ws.userId === userId) {
      return WorkspaceRole.ADMIN;
    }
    const m = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        profileId: userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      select: { role: true },
    });
    return m?.role ?? null;
  }

  async requireWorkspaceRole(
    userId: string,
    workspaceId: string,
    min: 'VIEWER' | 'EDITOR' | 'ADMIN',
  ): Promise<WorkspaceRole> {
    const role = await this.getRoleInWorkspace(userId, workspaceId);
    if (!role) {
      throw new NotFoundException('Workspace não encontrado');
    }
    const rank: Record<WorkspaceRole, number> = {
      [WorkspaceRole.VIEWER]: 0,
      [WorkspaceRole.EDITOR]: 1,
      [WorkspaceRole.ADMIN]: 2,
    };
    const minRole: WorkspaceRole =
      min === 'ADMIN'
        ? WorkspaceRole.ADMIN
        : min === 'EDITOR'
          ? WorkspaceRole.EDITOR
          : WorkspaceRole.VIEWER;
    if (rank[role] < rank[minRole]) {
      throw new ForbiddenException('Permissão insuficiente neste workspace');
    }
    return role;
  }

  async requireAdmin(userId: string, workspaceId: string): Promise<void> {
    await this.requireWorkspaceRole(userId, workspaceId, 'ADMIN');
  }

  async requireEditorOrAdmin(userId: string, workspaceId: string): Promise<void> {
    await this.requireWorkspaceRole(userId, workspaceId, 'EDITOR');
  }

  /**
   * Vault: leitura para VIEWER+; escrita para EDITOR+ (inclui dono do workspace).
   */
  canRoleReadVault(role: WorkspaceRole): boolean {
    return (
      role === WorkspaceRole.VIEWER ||
      role === WorkspaceRole.EDITOR ||
      role === WorkspaceRole.ADMIN
    );
  }

  canRoleWriteVault(role: WorkspaceRole): boolean {
    return role === WorkspaceRole.EDITOR || role === WorkspaceRole.ADMIN;
  }
}
