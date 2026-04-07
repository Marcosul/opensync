import { BadGatewayException } from '@nestjs/common';
import { GiteaService } from './gitea.service';

describe('GiteaService', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.GITEA_URL = 'http://gitea.local';
    process.env.GITEA_ADMIN_TOKEN = 'test-token';
    process.env.GITEA_DEFAULT_ORG = 'opensync';
  });

  afterEach(() => {
    process.env = { ...envBackup };
    jest.restoreAllMocks();
  });

  it('reutiliza repo em conflito 409', async () => {
    const svc = new GiteaService();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('conflict', { status: 409 }));

    await expect(svc.createRepoForVault('abcd1234efgh5678', 'Meu Vault')).resolves.toBe(
      'opensync/meu-vault-abcd1234',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lança BadGateway quando gitea falha no create', async () => {
    const svc = new GiteaService();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));

    await expect(svc.createRepoForVault('abcd1234efgh5678', 'Meu Vault')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
