import { BadGatewayException, ConflictException } from '@nestjs/common';
import { VaultsService } from './vaults.service';

const WORKSPACE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GITEA_ORG_SLUG = 'wsaaaaaaaabbbb4ccc8dddeeeeeeeeeeee';
const REPO_WS_FRAG = 'aaaaaaaabbbb';

describe('VaultsService', () => {
  const prisma = {
    vault: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    workspace: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      upsert: jest.fn(),
    },
  } as any;

  const gitea = {
    ensureOrg: jest.fn(),
    createRepoForVault: jest.fn(),
    deleteRepo: jest.fn(),
  } as any;

  const workspaces = {
    resolveWorkspaceForCreate: jest.fn().mockResolvedValue(WORKSPACE_ID),
  } as any;

  const workspaceAccess = {
    requireEditorOrAdmin: jest.fn().mockResolvedValue(undefined),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cria vault e persiste giteaRepo', async () => {
    prisma.vault.findFirst.mockResolvedValue(null);
    prisma.profile.upsert.mockResolvedValue({});
    prisma.workspace.findFirst.mockResolvedValue({
      id: WORKSPACE_ID,
      name: 'Meu Workspace',
      giteaOrg: null,
    });
    prisma.workspace.update.mockResolvedValue({});
    gitea.ensureOrg.mockResolvedValue(undefined);
    gitea.createRepoForVault.mockResolvedValue(
      `${GITEA_ORG_SLUG}/meu-vault-${REPO_WS_FRAG}`,
    );
    prisma.vault.create.mockResolvedValue({
      id: 'vault-1',
      workspaceId: WORKSPACE_ID,
      name: 'Meu Vault',
      description: null,
      path: './openclaw',
      giteaRepo: `${GITEA_ORG_SLUG}/meu-vault-${REPO_WS_FRAG}`,
      createdAt: new Date().toISOString(),
    });

    const service = new VaultsService(prisma, gitea, workspaces, workspaceAccess);
    const result = await service.createVaultForUser('user-1', 'u@e.com', { name: 'Meu Vault' });
    expect(result.giteaRepo).toBe(`${GITEA_ORG_SLUG}/meu-vault-${REPO_WS_FRAG}`);
    expect(gitea.ensureOrg).toHaveBeenCalledWith({
      username: GITEA_ORG_SLUG,
      fullName: 'Meu Workspace',
    });
    expect(gitea.createRepoForVault).toHaveBeenCalledWith(
      'Meu Vault',
      GITEA_ORG_SLUG,
      WORKSPACE_ID,
    );
    expect(prisma.vault.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          name: 'Meu Vault',
        }),
      }),
    );
  });

  it('bloqueia nome duplicado no mesmo workspace', async () => {
    prisma.profile.upsert.mockResolvedValue({});
    workspaces.resolveWorkspaceForCreate.mockResolvedValue(WORKSPACE_ID);
    prisma.vault.findFirst.mockResolvedValue({ id: 'already' });
    const service = new VaultsService(prisma, gitea, workspaces, workspaceAccess);
    await expect(
      service.createVaultForUser('user-1', 'u@e.com', { name: 'Duplicado' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('executa compensação no gitea quando persistência falha', async () => {
    prisma.vault.findFirst.mockResolvedValue(null);
    prisma.profile.upsert.mockResolvedValue({});
    workspaces.resolveWorkspaceForCreate.mockResolvedValue(WORKSPACE_ID);
    prisma.workspace.findFirst.mockResolvedValue({
      id: WORKSPACE_ID,
      name: 'W',
      giteaOrg: GITEA_ORG_SLUG,
    });
    gitea.createRepoForVault.mockResolvedValue(
      `${GITEA_ORG_SLUG}/compensar-${REPO_WS_FRAG}`,
    );
    prisma.vault.create.mockRejectedValue(new Error('db down'));

    const service = new VaultsService(prisma, gitea, workspaces, workspaceAccess);
    await expect(
      service.createVaultForUser('user-1', 'u@e.com', { name: 'Compensar' }),
    ).rejects.toThrow('db down');
    expect(gitea.deleteRepo).toHaveBeenCalledWith(
      `${GITEA_ORG_SLUG}/compensar-${REPO_WS_FRAG}`,
    );
    expect(gitea.ensureOrg).not.toHaveBeenCalled();
  });

  it('desativa vault e apaga repo no Gitea', async () => {
    prisma.vault.findFirst.mockResolvedValue({
      id: 'v1',
      workspaceId: WORKSPACE_ID,
      giteaRepo: 'opensync/v-x',
    });
    prisma.vault.update.mockResolvedValue({});
    gitea.deleteRepo.mockResolvedValue(undefined);
    const service = new VaultsService(prisma, gitea, workspaces, workspaceAccess);
    await service.deleteVaultForUser('user-1', 'v1');
    expect(prisma.vault.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { isActive: false },
    });
    expect(gitea.deleteRepo).toHaveBeenCalledWith('opensync/v-x');
  });

  it('reativa vault se Gitea falhar ao apagar repo', async () => {
    prisma.vault.findFirst.mockResolvedValue({
      id: 'v1',
      workspaceId: WORKSPACE_ID,
      giteaRepo: 'opensync/v-x',
    });
    prisma.vault.update.mockResolvedValue({});
    gitea.deleteRepo.mockRejectedValue(new BadGatewayException('gitea down'));
    const service = new VaultsService(prisma, gitea, workspaces, workspaceAccess);
    await expect(service.deleteVaultForUser('user-1', 'v1')).rejects.toThrow(
      BadGatewayException,
    );
    expect(prisma.vault.update).toHaveBeenCalledTimes(2);
    expect(prisma.vault.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'v1' },
      data: { isActive: false },
    });
    expect(prisma.vault.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'v1' },
      data: { isActive: true },
    });
  });
});
