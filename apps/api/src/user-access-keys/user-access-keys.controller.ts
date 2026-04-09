import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { UserAccessKeysService } from './user-access-keys.service';

@Controller('user-access-keys')
export class UserAccessKeysController {
  constructor(private readonly service: UserAccessKeysService) {}

  private requireUserId(userId: string | undefined): string {
    const id = userId?.trim();
    if (!id) throw new UnauthorizedException('x-opensync-user-id obrigatorio');
    return id;
  }

  /** Gerar novo token de acesso (dashboard → usuário autenticado via Supabase). */
  @Post()
  async create(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body('label') label?: string,
  ) {
    const uid = this.requireUserId(userId);
    return this.service.createForUser(uid, label);
  }

  /** Listar tokens ativos. */
  @Get()
  async list(@Headers('x-opensync-user-id') userId: string | undefined) {
    const uid = this.requireUserId(userId);
    return { keys: await this.service.listForUser(uid) };
  }

  /** Revogar token por ID. */
  @Delete(':id')
  async revoke(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Param('id') keyId: string,
  ) {
    const uid = this.requireUserId(userId);
    return this.service.revokeForUser(uid, keyId);
  }
}
