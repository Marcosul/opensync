import { BadGatewayException, ConflictException } from '@nestjs/common';
import { VaultsService } from './vaults.service';

describe('VaultsService', () => {
  const prisma = {
    vault: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      upsert: jest.fn(),
    },
  } as any;

  const gitea = {
    createRepoForVault: jest.fn(),
    deleteRepo: jest.fn(),
  } as any;

  const workspaces = {
    resolveWorkspaceForCreate: jest.fn().mockResolvedValue('ws-1'),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cria vault e persiste giteaRepo', async () => {
    prisma.vault.findFirst.mockResolvedValue(null);
    prisma.profile.upsert.mockResolvedValue({});
    gitea.createRepoForVault.mockResolvedValue('opensync/vault-123');
    prisma.vault.create.mockResolvedValue({
      id: 'vault-1',
      workspaceId: 'ws-1',
      name: 'Meu Vault',
      description: null,
      path: './openclaw',
      giteaRepo: 'opensync/vault-123',
      createdAt: new Date().toISOString(),
    });

    const service = new VaultsService(prisma, gitea, workspaces);
    const result = await service.createVaultForUser('user-1', 'u@e.com', { name: 'Meu Vault' });
    expect(result.giteaRepo).toBe('opensync/vault-123');
    expect(gitea.createRepoForVault).toHaveBeenCalled();
    expect(prisma.vault.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          name: 'Meu Vault',
        }),
      }),
    );
  });

  it('bloqueia nome duplicado no mesmo workspace', async () => {
    prisma.profile.upsert.mockResolvedValue({});
    workspaces.resolveWorkspaceForCreate.mockResolvedValue('ws-1');
    prisma.vault.findFirst.mockResolvedValue({ id: 'already' });
    const service = new VaultsService(prisma, gitea, workspaces);
    await expect(
      service.createVaultForUser('user-1', 'u@e.com', { name: 'Duplicado' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('executa compensação no gitea quando persistência falha', async () => {
    prisma.vault.findFirst.mockResolvedValue(null);
    prisma.profile.upsert.mockResolvedValue({});
    workspaces.resolveWorkspaceForCreate.mockResolvedValue('ws-1');
    gitea.createRepoForVault.mockResolvedValue('opensync/vault-xyz');
    prisma.vault.create.mockRejectedValue(new Error('db down'));

    const service = new VaultsService(prisma, gitea, workspaces);
    await expect(
      service.createVaultForUser('user-1', 'u@e.com', { name: 'Compensar' }),
    ).rejects.toThrow('db down');
    expect(gitea.deleteRepo).toHaveBeenCalledWith('opensync/vault-xyz');
  });

  it('desativa vault e apaga repo no Gitea', async () => {
    prisma.vault.findFirst.mockResolvedValue({
      id: 'v1',
      giteaRepo: 'opensync/v-x',
    });
    prisma.vault.update.mockResolvedValue({});
    gitea.deleteRepo.mockResolvedValue(undefined);
    const service = new VaultsService(prisma, gitea, workspaces);
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
      giteaRepo: 'opensync/v-x',
    });
    prisma.vault.update.mockResolvedValue({});
    gitea.deleteRepo.mockRejectedValue(new BadGatewayException('gitea down'));
    const service = new VaultsService(prisma, gitea, workspaces);
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
