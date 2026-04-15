import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { WorkspaceAccessService } from './workspace-access.service';

describe('WorkspaceAccessService', () => {
  const prisma = {
    workspace: { findFirst: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dono do workspace é tratado como ADMIN', async () => {
    prisma.workspace.findFirst.mockResolvedValue({ userId: 'owner-1' });
    prisma.workspaceMember.findFirst.mockResolvedValue(null);

    const service = new WorkspaceAccessService(prisma);
    const role = await service.getRoleInWorkspace('owner-1', 'ws-1');
    expect(role).toBe(WorkspaceRole.ADMIN);
  });

  it('membro ativo devolve o papel', async () => {
    prisma.workspace.findFirst.mockResolvedValue({ userId: 'owner-1' });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      role: WorkspaceRole.EDITOR,
    });

    const service = new WorkspaceAccessService(prisma);
    const role = await service.getRoleInWorkspace('member-1', 'ws-1');
    expect(role).toBe(WorkspaceRole.EDITOR);
  });

  it('requireWorkspaceRole lança se sem acesso', async () => {
    prisma.workspace.findFirst.mockResolvedValue(null);

    const service = new WorkspaceAccessService(prisma);
    await expect(service.requireWorkspaceRole('u', 'ws', 'VIEWER')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requireWorkspaceRole lança Forbidden se papel baixo', async () => {
    prisma.workspace.findFirst.mockResolvedValue({ userId: 'owner' });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      role: WorkspaceRole.VIEWER,
      status: WorkspaceMemberStatus.ACTIVE,
    });

    const service = new WorkspaceAccessService(prisma);
    await expect(service.requireWorkspaceRole('u', 'ws', 'EDITOR')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
