import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  WorkspaceInviteStatus,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';
import { WorkspaceInviteMailService } from './workspace-invite-mail.service';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function resolveAppBaseUrl(): string {
  return (
    process.env.OPENSYNC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

@Injectable()
export class WorkspaceInvitesService {
  private readonly logger = new Logger(WorkspaceInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
    private readonly mail: WorkspaceInviteMailService,
  ) {}

  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private isLegacySchemaError(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return false;
    }
    const code = (error as { code?: string }).code;
    return code === 'P2021' || code === 'P2022';
  }

  async listForWorkspace(actorId: string, workspaceId: string) {
    await this.access.requireAdmin(actorId, workspaceId);
    const invites = await this.prisma.workspaceInvite.findMany({
      where: { workspaceId, status: WorkspaceInviteStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: { select: { id: true, email: true } },
      },
    });
    this.logger.log(
      `${colors.cyan}✉️ Convites pendentes:${colors.reset} workspace=${workspaceId} count=${invites.length}`,
    );
    return invites;
  }

  /** Convites pendentes onde o e-mail coincide com o perfil (área in-app). */
  async listPendingForUser(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!profile) {
      return [];
    }
    const now = new Date();
    let invites: Array<{
      id: string;
      email: string;
      role: WorkspaceRole;
      expiresAt: Date;
      workspace: { id: string; name: string };
    }>;
    try {
      invites = await this.prisma.workspaceInvite.findMany({
        where: {
          status: WorkspaceInviteStatus.PENDING,
          expiresAt: { gt: now },
          email: { equals: profile.email, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          workspace: { select: { id: true, name: true } },
        },
      });
    } catch (error) {
      if (!this.isLegacySchemaError(error)) {
        throw error;
      }
      this.logger.warn(
        `${colors.yellow}⚠️ Convites indisponíveis (schema antigo):${colors.reset} user=${userId} code=${(error as { code?: string }).code ?? 'unknown'}`,
      );
      return [];
    }
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      workspace: i.workspace,
    }));
  }

  async createInvite(
    actorId: string,
    workspaceId: string,
    dto: { email: string; role: WorkspaceRole; message?: string },
  ) {
    await this.access.requireAdmin(actorId, workspaceId);
    const email = normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException('E-mail inválido');
    }

    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const existingProfile = await this.prisma.profile.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingProfile) {
      const already = await this.prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          profileId: existingProfile.id,
          status: WorkspaceMemberStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (already) {
        throw new ConflictException('Este utilizador já é membro do workspace');
      }
    }

    const dupPending = await this.prisma.workspaceInvite.findFirst({
      where: {
        workspaceId,
        status: WorkspaceInviteStatus.PENDING,
        email: { equals: email, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (dupPending) {
      throw new ConflictException('Já existe um convite pendente para este e-mail');
    }

    const token = this.newToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await this.prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email,
        role: dto.role,
        token,
        expiresAt,
        message: dto.message?.trim() || null,
        invitedById: actorId,
        status: WorkspaceInviteStatus.PENDING,
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        token: true,
      },
    });

    const base = resolveAppBaseUrl();
    const inviteUrl = `${base}/invite/workspace?token=${encodeURIComponent(invite.token)}`;
    this.mail.sendWorkspaceInviteLink({
      toEmail: email,
      workspaceName: workspace.name,
      inviteUrl,
    });

    this.logger.log(
      `${colors.green}✅ Convite criado:${colors.reset} workspace=${workspaceId} email=${email} role=${dto.role}`,
    );

    return { invite: { ...invite, inviteUrl } };
  }

  async cancelInvite(actorId: string, workspaceId: string, inviteId: string) {
    await this.access.requireAdmin(actorId, workspaceId);
    const inv = await this.prisma.workspaceInvite.findFirst({
      where: { id: inviteId, workspaceId },
      select: { id: true, status: true },
    });
    if (!inv) {
      throw new NotFoundException('Convite não encontrado');
    }
    if (inv.status !== WorkspaceInviteStatus.PENDING) {
      throw new BadRequestException('Convite não está pendente');
    }
    await this.prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: { status: WorkspaceInviteStatus.CANCELLED },
    });
    this.logger.log(`${colors.yellow}🚫 Convite cancelado:${colors.reset} id=${inviteId}`);
    return { ok: true as const };
  }

  async resendInvite(actorId: string, workspaceId: string, inviteId: string) {
    await this.access.requireAdmin(actorId, workspaceId);
    const inv = await this.prisma.workspaceInvite.findFirst({
      where: { id: inviteId, workspaceId },
      select: {
        id: true,
        email: true,
        status: true,
        workspace: { select: { name: true } },
      },
    });
    if (!inv) {
      throw new NotFoundException('Convite não encontrado');
    }
    if (inv.status !== WorkspaceInviteStatus.PENDING) {
      throw new BadRequestException('Convite não está pendente');
    }
    const token = this.newToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: { token, expiresAt },
    });
    const base = resolveAppBaseUrl();
    const inviteUrl = `${base}/invite/workspace?token=${encodeURIComponent(token)}`;
    this.mail.sendWorkspaceInviteLink({
      toEmail: inv.email,
      workspaceName: inv.workspace.name,
      inviteUrl,
    });
    return { ok: true as const, inviteUrl };
  }

  async getInviteByToken(token: string) {
    const trimmed = token?.trim();
    if (!trimmed) {
      throw new BadRequestException('Token ausente');
    }
    const invite = await this.prisma.workspaceInvite.findFirst({
      where: { token: trimmed },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        workspace: { select: { id: true, name: true } },
      },
    });
    if (!invite) {
      throw new NotFoundException('Convite não encontrado');
    }
    if (invite.status !== WorkspaceInviteStatus.PENDING) {
      throw new BadRequestException('Convite já foi utilizado ou cancelado');
    }
    if (invite.expiresAt < new Date()) {
      await this.prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: WorkspaceInviteStatus.EXPIRED },
      });
      throw new BadRequestException('Convite expirado');
    }
    return invite;
  }

  async acceptInvite(userId: string, userEmail: string | undefined, token: string) {
    const invite = await this.getInviteByToken(token);
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const email = profile?.email ?? userEmail ?? '';
    if (!email || normalizeEmail(email) !== normalizeEmail(invite.email)) {
      throw new ForbiddenException(
        'Inicie sessão com a conta cujo e-mail corresponde ao convite',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_profileId: {
            workspaceId: invite.workspace.id,
            profileId: userId,
          },
        },
        create: {
          workspaceId: invite.workspace.id,
          profileId: userId,
          role: invite.role,
          status: WorkspaceMemberStatus.ACTIVE,
        },
        update: {
          role: invite.role,
          status: WorkspaceMemberStatus.ACTIVE,
        },
      });
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: WorkspaceInviteStatus.ACCEPTED },
      });
    });

    this.logger.log(
      `${colors.green}🎉 Convite aceite:${colors.reset} user=${userId} workspace=${invite.workspace.id}`,
    );
    return { ok: true as const, workspaceId: invite.workspace.id };
  }

  /** Aceitar pelo id do convite na lista in-app (mesmo token já conhecido pelo cliente). */
  async acceptInviteById(userId: string, userEmail: string | undefined, inviteId: string) {
    const inv = await this.prisma.workspaceInvite.findFirst({
      where: { id: inviteId, status: WorkspaceInviteStatus.PENDING },
      select: { id: true, email: true, role: true, token: true, expiresAt: true },
    });
    if (!inv) {
      throw new NotFoundException('Convite não encontrado');
    }
    if (inv.expiresAt < new Date()) {
      throw new BadRequestException('Convite expirado');
    }
    return this.acceptInvite(userId, userEmail, inv.token);
  }
}
