import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { VaultGitSyncService } from '../sync/vault-git-sync.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { SyncVaultDto } from './dto/sync-vault.dto';
import { VaultsService } from './vaults.service';

@Controller('vaults')
export class VaultsController {
  constructor(
    private readonly vaultsService: VaultsService,
    private readonly vaultGitSync: VaultGitSyncService,
  ) {}

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

  @Post(':id/sync')
  async syncVault(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: SyncVaultDto,
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.getVaultForUser(uid, id);
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }
    const { commitHash } = await this.vaultGitSync.pushTextFiles(
      vault.giteaRepo,
      body.files,
    );
    return { ok: true, commitHash };
  }
}
