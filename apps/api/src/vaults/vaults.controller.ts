import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { VaultGitSyncService } from '../sync/vault-git-sync.service';
import { VaultFilesService } from '../vault-files/vault-files.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { SyncVaultDto } from './dto/sync-vault.dto';
import { GraphService } from './graph.service';
import { VaultsService } from './vaults.service';

@Controller('vaults')
export class VaultsController {
  constructor(
    private readonly vaultsService: VaultsService,
    private readonly vaultGitSync: VaultGitSyncService,
    private readonly vaultFiles: VaultFilesService,
    private readonly graphService: GraphService,
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

  @Post(':id/agent-token')
  @HttpCode(HttpStatus.CREATED)
  async createAgentApiToken(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
  ) {
    const uid = this.requireUserId(userId);
    return this.vaultsService.createAgentApiTokenForUser(uid, id.trim());
  }

  @Post(':id/git/deploy-key')
  @HttpCode(HttpStatus.CREATED)
  async createAgentDeployKey(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
  ) {
    const uid = this.requireUserId(userId);
    return this.vaultsService.createAgentDeployKeyForUser(uid, id.trim());
  }

  @Delete(':id/git/deploy-key')
  async deleteAgentDeployKey(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
  ) {
    const uid = this.requireUserId(userId);
    return this.vaultsService.deleteAgentDeployKeyForUser(uid, id.trim());
  }

  @Get(':id/git/tree')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async getGitTree(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Query('ref') _ref?: string,
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.getVaultForUser(uid, id.trim());
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }
    await this.vaultFiles.backfillFromGiteaIfEmpty(vault.id, vault.giteaRepo);
    return this.vaultFiles.listTree(vault.id);
  }

  @Get(':id/git/blob')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getGitBlob(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Query('path') filePath: string | undefined,
  ) {
    const uid = this.requireUserId(userId);
    if (!filePath?.trim()) {
      throw new BadRequestException('Query path e obrigatoria');
    }
    const vault = await this.vaultsService.getVaultForUser(uid, id.trim());
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }
    const { content, version } = await this.vaultFiles.getContent(vault.id, filePath);
    return { content, commitHash: version };
  }

  @Get(':id/graph')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async getVaultGraph(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Query('rebuild') rebuild?: string,
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.getVaultForUser(uid, id.trim());
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }
    if (rebuild === 'true') {
      return this.graphService.buildAndCache(vault.id);
    }
    return this.graphService.getOrBuildGraph(vault.id);
  }

  @Post(':id/sync')
  async syncVault(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: SyncVaultDto,
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.assertVaultWritableForUser(uid, id.trim());
    return this.vaultFiles.applyTrustedSnapshot(vault.id, body.files);
  }
}
