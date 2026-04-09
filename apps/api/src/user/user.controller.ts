import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { UserService } from './user.service';
import { resolveUserWithApiKey } from '../user-access-keys/user-access-keys.util';
import { PrismaService } from '../common/prisma.service';

/**
 * Endpoints para o CLI opensync-ubuntu.
 * Autenticados via Bearer usk_... (UserApiKey), não via x-opensync-user-id.
 */
@Controller('user')
export class UserController {
  constructor(
    private readonly service: UserService,
    private readonly prisma: PrismaService,
  ) {}

  private async auth(authorization: string | undefined) {
    return resolveUserWithApiKey(this.prisma, authorization);
  }

  /** Validar credenciais e obter dados da conta. */
  @Get('me')
  async me(@Headers('authorization') authorization: string | undefined) {
    const { userId, email } = await this.auth(authorization);
    return this.service.getMe(userId, email);
  }

  /** Listar vaults do usuário (todos os workspaces). */
  @Get('vaults')
  async listVaults(@Headers('authorization') authorization: string | undefined) {
    const { userId } = await this.auth(authorization);
    const vaults = await this.service.listVaults(userId);
    return { vaults };
  }

  /** Criar novo vault no workspace padrão. */
  @Post('vaults')
  async createVault(
    @Headers('authorization') authorization: string | undefined,
    @Body('name') name: string,
  ) {
    const { userId, email } = await this.auth(authorization);
    const vault = await this.service.createVault(userId, email, name);
    return { vault };
  }

  /** Gerar token de sync para um vault específico. */
  @Post('vaults/:id/sync-token')
  async createSyncToken(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') vaultId: string,
  ) {
    const { userId } = await this.auth(authorization);
    return this.service.createSyncToken(userId, vaultId);
  }
}
