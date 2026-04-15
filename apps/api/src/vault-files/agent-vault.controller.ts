import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from '../common/prisma.service';
import { resolveVaultWithAgentBearer } from '../common/agent-vault.resolve';
import { VaultFilesService } from './vault-files.service';

@Controller('agent/vaults')
@UseGuards(ThrottlerGuard)
export class AgentVaultController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultFiles: VaultFilesService,
  ) {}

  @Get(':vaultId/changes')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async changes(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('cursor') cursor?: string,
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    return this.vaultFiles.getChanges(vaultId.trim(), cursor);
  }

  /**
   * Estado actual dos ficheiros no Postgres (mesma semantica que GET /vaults/:id/git/tree para utilizador),
   * incluindo backfill Gitea→Postgres quando ainda nao ha linhas — necessario para o agente Ubuntu
   * hidratar a pasta local mesmo sem o browser ter aberto o vault antes.
   */
  @Get(':vaultId/files/manifest')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async manifest(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const { vault } = await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    await this.vaultFiles.backfillFromGiteaIfEmpty(vault.id, vault.giteaRepo);
    return this.vaultFiles.listTree(vault.id);
  }

  @Post(':vaultId/files/upsert')
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  async upsert(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: { path?: string; content?: string; base_version?: string | null },
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    const path = body?.path;
    const content = body?.content;
    if (!path?.trim() || typeof content !== 'string') {
      throw new BadRequestException('path e content obrigatorios');
    }
    return this.vaultFiles.upsertWithBaseVersion(
      vaultId.trim(),
      path,
      content,
      body.base_version,
    );
  }

  @Post(':vaultId/files/snapshot')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async snapshot(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { files?: Record<string, string> },
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    const files = body?.files;
    if (files === undefined || files === null || typeof files !== 'object' || Array.isArray(files)) {
      throw new BadRequestException(
        'Corpo JSON obrigatorio: { "files": { "path": "conteudo", ... } }; use files: {} para limpar o vault',
      );
    }
    return this.vaultFiles.applyAgentSnapshot(vaultId.trim(), files as Record<string, string>);
  }

  @Post(':vaultId/files/delete')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async deleteFile(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { path?: string; base_version?: string },
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    const path = body?.path;
    if (!path?.trim() || body.base_version === undefined) {
      throw new BadRequestException('path e base_version obrigatorios');
    }
    return this.vaultFiles.deleteWithBaseVersion(
      vaultId.trim(),
      path,
      body.base_version,
    );
  }

  @Get(':vaultId/files/content')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async content(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('path') filePath: string | undefined,
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    if (!filePath?.trim()) {
      throw new BadRequestException('Query path obrigatoria');
    }
    return this.vaultFiles.getContent(vaultId.trim(), filePath);
  }
}
