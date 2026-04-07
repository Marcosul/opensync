import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateVaultDto } from './dto/create-vault.dto';
import { VaultsService } from './vaults.service';

@Controller('vaults')
export class VaultsController {
  constructor(private readonly vaultsService: VaultsService) {}

  private requireUserId(userId: string | undefined): string {
    const normalized = userId?.trim();
    if (!normalized) {
      throw new UnauthorizedException('Usuário ausente (x-opensync-user-id)');
    }
    return normalized;
  }

  @Post()
  async createVault(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Headers('x-opensync-user-email') userEmail: string | undefined,
    @Body() body: CreateVaultDto,
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.createVaultForUser(uid, userEmail, body);
    return { vault };
  }

  @Get()
  async listVaults(@Headers('x-opensync-user-id') userId: string | undefined) {
    const uid = this.requireUserId(userId);
    const vaults = await this.vaultsService.listVaultsForUser(uid);
    return { vaults };
  }

  @Delete(':id')
  async deleteVault(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
  ) {
    const uid = this.requireUserId(userId);
    await this.vaultsService.deleteVaultForUser(uid, id);
    return { ok: true };
  }
}
