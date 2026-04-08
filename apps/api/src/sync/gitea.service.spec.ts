import { BadGatewayException } from '@nestjs/common';
import { GiteaService } from './gitea.service';

describe('GiteaService', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.GITEA_URL = 'http://gitea.local';
    process.env.GITEA_ADMIN_TOKEN = 'test-token';
  });

  afterEach(() => {
    process.env = { ...envBackup };
    jest.restoreAllMocks();
  });

  it('reutiliza repo em conflito 409', async () => {
    const svc = new GiteaService();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('conflict', { status: 409 }));

    const wsId = 'abcd1234-abcd-abcd-abcd-abcdef123456';
    await expect(
      svc.createRepoForVault('Meu Vault', 'opensync', wsId),
    ).resolves.toBe('opensync/meu-vault-abcd1234abcd');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lança BadGateway quando gitea falha no create', async () => {
    const svc = new GiteaService();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));

    const wsId = 'abcd1234-abcd-abcd-abcd-abcdef123456';
    await expect(
      svc.createRepoForVault('Meu Vault', 'opensync', wsId),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
