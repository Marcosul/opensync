import { ConflictException } from '@nestjs/common';
import { VaultFilesService } from './vault-files.service';

function mockTx() {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    vaultFile: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    vaultFileChange: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

describe('VaultFilesService', () => {
  let prisma: { $transaction: jest.Mock; vaultFile: { count: jest.Mock } };
  let vaultGitSync: { readRepoTree: jest.Mock; readRepoBlob: jest.Mock };
  let service: VaultFilesService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      vaultFile: { count: jest.fn() },
    };
    vaultGitSync = {
      readRepoTree: jest.fn(),
      readRepoBlob: jest.fn(),
    };
    service = new VaultFilesService(prisma as never, vaultGitSync as never, { notify: jest.fn().mockResolvedValue(undefined) } as never);
  });

  describe('applyTrustedSnapshot', () => {
    it('com mapa vazio faz soft-delete de todos os ficheiros activos', async () => {
      const tx = mockTx();
      tx.vaultFile.findMany.mockResolvedValue([{ path: 'notas/a.md', version: 2 }]);
      tx.vaultFile.update.mockResolvedValue({});
      tx.vaultFileChange.create.mockResolvedValue({});
      tx.vaultFileChange.findFirst.mockResolvedValue({ id: 99n });
      prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<string>) =>
        fn(tx as never),
      );

      const result = await service.applyTrustedSnapshot('00000000-0000-0000-0000-000000000001', {});

      expect(result.ok).toBe(true);
      expect(result.commitHash).toBe('db:99');
      expect(tx.vaultFile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            vaultId_path: {
              vaultId: '00000000-0000-0000-0000-000000000001',
              path: 'notas/a.md',
            },
          },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(tx.vaultFileChange.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeType: 'delete', path: 'notas/a.md' }),
        }),
      );
    });

    it('com ficheiros validos cria entrada e change upsert', async () => {
      const tx = mockTx();
      tx.vaultFile.findUnique.mockResolvedValue(null);
      tx.vaultFile.create.mockResolvedValue({});
      tx.vaultFileChange.create.mockResolvedValue({});
      tx.vaultFile.findMany.mockResolvedValue([{ path: 'x.md', version: 1 }]);
      tx.vaultFileChange.findFirst.mockResolvedValue({ id: 1n });
      prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<string>) =>
        fn(tx as never),
      );

      await service.applyTrustedSnapshot('00000000-0000-0000-0000-000000000002', {
        'x.md': '# ola',
      });

      expect(tx.vaultFile.create).toHaveBeenCalled();
      expect(tx.vaultFileChange.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeType: 'upsert', path: 'x.md' }),
        }),
      );
    });
  });

  describe('backfillFromGiteaIfEmpty', () => {
    it('nao chama Gitea se ja existir qualquer linha em vault_files', async () => {
      prisma.vaultFile.count.mockResolvedValue(1);

      await service.backfillFromGiteaIfEmpty('00000000-0000-0000-0000-000000000003', 'org/repo');

      expect(vaultGitSync.readRepoTree).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('upsertWithBaseVersion', () => {
    it('revive ficheiro soft-deleted com base_version null', async () => {
      const tx = mockTx();
      const deletedAt = new Date();
      tx.vaultFile.findUnique.mockResolvedValue({
        path: 'b.md',
        vaultId: 'v',
        version: 4,
        deletedAt,
        content: null,
      });
      tx.vaultFile.update.mockResolvedValue({ updatedAt: new Date('2026-01-01') });
      tx.vaultFileChange.create.mockResolvedValue({});
      prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx as never));

      const out = await service.upsertWithBaseVersion('v', 'b.md', 'novo', null);

      expect(out.version).toBe('5');
      expect(tx.vaultFile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: null, version: 5 }),
        }),
      );
    });

    it('rejeita revive soft-deleted se base_version nao coincide', async () => {
      const tx = mockTx();
      tx.vaultFile.findUnique.mockResolvedValue({
        path: 'b.md',
        vaultId: 'v',
        version: 4,
        deletedAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx as never));

      await expect(service.upsertWithBaseVersion('v', 'b.md', 'x', '3')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('ficheiro activo exige base_version', async () => {
      const tx = mockTx();
      tx.vaultFile.findUnique.mockResolvedValue({
        path: 'c.md',
        vaultId: 'v',
        version: 2,
        deletedAt: null,
      });
      prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx as never));

      await expect(service.upsertWithBaseVersion('v', 'c.md', 'x', null)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
