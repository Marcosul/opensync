import { ConflictException } from '@nestjs/common';
import { VaultsService } from './vaults.service';

describe('VaultsService', () => {
  const prisma = {
    vault: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    profile: {
      upsert: jest.fn(),
    },
  } as any;

  const gitea = {
    createRepoForVault: jest.fn(),
    deleteRepo: jest.fn(),
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
      name: 'Meu Vault',
      description: null,
      path: './openclaw',
      giteaRepo: 'opensync/vault-123',
      createdAt: new Date().toISOString(),
    });

    const service = new VaultsService(prisma, gitea);
    const result = await service.createVaultForUser('user-1', 'u@e.com', { name: 'Meu Vault' });
    expect(result.giteaRepo).toBe('opensync/vault-123');
    expect(gitea.createRepoForVault).toHaveBeenCalled();
  });

  it('bloqueia nome duplicado por usuário', async () => {
    prisma.vault.findFirst.mockResolvedValue({ id: 'already' });
    const service = new VaultsService(prisma, gitea);
    await expect(
      service.createVaultForUser('user-1', 'u@e.com', { name: 'Duplicado' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('executa compensação no gitea quando persistência falha', async () => {
    prisma.vault.findFirst.mockResolvedValue(null);
    prisma.profile.upsert.mockResolvedValue({});
    gitea.createRepoForVault.mockResolvedValue('opensync/vault-xyz');
    prisma.vault.create.mockRejectedValue(new Error('db down'));

    const service = new VaultsService(prisma, gitea);
    await expect(
      service.createVaultForUser('user-1', 'u@e.com', { name: 'Compensar' }),
    ).rejects.toThrow('db down');
    expect(gitea.deleteRepo).toHaveBeenCalledWith('opensync/vault-xyz');
  });
});
