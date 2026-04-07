import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';

describe('VaultsController (e2e-lite)', () => {
  let app: NestFastifyApplication;
  const vaultsService = {
    createVaultForUser: jest.fn(),
    listVaultsForUser: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VaultsController],
      providers: [{ provide: VaultsService, useValue: vaultsService }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /vaults cria vault quando headers do usuário estão presentes', async () => {
    vaultsService.createVaultForUser.mockResolvedValue({
      id: 'vault-1',
      name: 'Vault 1',
      giteaRepo: 'opensync/vault-1',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/vaults',
      headers: {
        'x-opensync-user-id': 'user-1',
        'x-opensync-user-email': 'user@test.dev',
      },
      payload: { name: 'Vault 1' },
    });

    expect(response.statusCode).toBe(201);
    expect(vaultsService.createVaultForUser).toHaveBeenCalledWith(
      'user-1',
      'user@test.dev',
      expect.objectContaining({ name: 'Vault 1' }),
    );
  });
});
