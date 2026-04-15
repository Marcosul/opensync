import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

@Injectable()
export class WorkspaceMembersService {
  private readonly logger = new Logger(WorkspaceMembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  async listMembers(userId: string, workspaceId: string) {
    await this.access.requireWorkspaceRole(userId, workspaceId, 'VIEWER');
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, status: WorkspaceMemberStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        createdAt: true,
        profile: { select: { id: true, email: true } },
      },
    });
    this.logger.log(
      `${colors.cyan}👥 Membros listados:${colors.reset} workspace=${workspaceId} count=${members.length}`,
    );
    return members.map((m) => ({
      id: m.id,
      role: m.role,
      createdAt: m.createdAt,
      profileId: m.profile.id,
      email: m.profile.email,
    }));
  }

  async updateMemberRole(
    actorId: string,
    workspaceId: string,
    memberId: string,
    role: WorkspaceRole,
  ) {
    await this.access.requireAdmin(actorId, workspaceId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, status: WorkspaceMemberStatus.ACTIVE },
      select: { id: true, profileId: true },
    });
    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { userId: true },
    });
    if (!ws) {
      throw new NotFoundException('Workspace não encontrado');
    }
    if (ws.userId === member.profileId && role !== WorkspaceRole.ADMIN) {
      throw new BadRequestException('O dono do workspace deve permanecer como Admin');
    }
    const updated = await this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
      select: {
        id: true,
        role: true,
        profile: { select: { id: true, email: true } },
      },
    });
    this.logger.log(
      `${colors.green}🛠️ Papel atualizado:${colors.reset} member=${memberId} role=${role}`,
    );
    return {
      id: updated.id,
      role: updated.role,
      profileId: updated.profile.id,
      email: updated.profile.email,
    };
  }

  async removeMember(actorId: string, workspaceId: string, memberId: string) {
    await this.access.requireAdmin(actorId, workspaceId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, status: WorkspaceMemberStatus.ACTIVE },
      select: { id: true, profileId: true },
    });
    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { userId: true },
    });
    if (ws?.userId === member.profileId) {
      throw new BadRequestException('Não é possível remover o dono do workspace');
    }
    await this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { status: WorkspaceMemberStatus.REMOVED },
    });
    this.logger.log(
      `${colors.yellow}🚪 Membro removido:${colors.reset} workspace=${workspaceId} member=${memberId}`,
    );
    return { ok: true as const };
  }
}
