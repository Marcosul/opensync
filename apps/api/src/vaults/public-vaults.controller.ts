import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { VaultFilesService } from '../vault-files/vault-files.service';
import { VaultsService } from './vaults.service';

/**
 * Leitura pública do conteúdo Git do vault (sem x-opensync-user-id).
 * O token na URL substitui autenticação e deve ser tratado como credencial.
 */
@Controller('public/vaults')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PublicVaultsController {
  constructor(
    private readonly vaultsService: VaultsService,
    private readonly vaultFiles: VaultFilesService,
  ) {}

  @Get(':token/meta')
  async getMeta(@Param('token') token: string) {
    const vault = await this.vaultsService.getVaultForPublicToken(token.trim());
    if (!vault) {
      throw new NotFoundException('Partilha invalida ou expirada');
    }
    return { name: vault.name };
  }

  @Get(':token/git/tree')
  async getGitTree(@Param('token') token: string, @Query('ref') _ref?: string) {
    const vault = await this.vaultsService.getVaultForPublicToken(token.trim());
    if (!vault) {
      throw new NotFoundException('Partilha invalida ou expirada');
    }
    await this.vaultFiles.backfillFromGiteaIfEmpty(vault.id, vault.giteaRepo);
    return this.vaultFiles.listTree(vault.id);
  }

  @Get(':token/git/blob')
  async getGitBlob(
    @Param('token') token: string,
    @Query('path') filePath: string | undefined,
  ) {
    if (!filePath?.trim()) {
      throw new BadRequestException('Query path e obrigatoria');
    }
    const vault = await this.vaultsService.getVaultForPublicToken(token.trim());
    if (!vault) {
      throw new NotFoundException('Partilha invalida ou expirada');
    }
    await this.vaultFiles.backfillFromGiteaIfEmpty(vault.id, vault.giteaRepo);
    const { content, version } = await this.vaultFiles.getContent(vault.id, filePath);
    return { content, commitHash: version };
  }
}
