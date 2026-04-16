import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { VaultSseEvent } from '../contracts/vault-sse-event';
import { VaultGitSyncService } from '../sync/vault-git-sync.service';
import { VaultFilesService } from '../vault-files/vault-files.service';
import { VaultSseService } from '../vault-files/vault-sse.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { SyncVaultDto } from './dto/sync-vault.dto';
import { GraphService } from './graph.service';
import { VaultsService } from './vaults.service';

@Controller('vaults')
export class VaultsController {
  private readonly logger = new Logger(VaultsController.name);

  constructor(
    private readonly vaultsService: VaultsService,
    private readonly vaultGitSync: VaultGitSyncService,
    private readonly vaultFiles: VaultFilesService,
    private readonly graphService: GraphService,
    private readonly vaultSse: VaultSseService,
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

  @Post(':id/public-share')
  @HttpCode(HttpStatus.OK)
  async enablePublicShare(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
  ) {
    const uid = this.requireUserId(userId);
    return this.vaultsService.enablePublicShareForUser(uid, id.trim());
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
    /** Mesmo critério que `git/tree`: primeiro pedido pode ser o blob — sem backfill o Postgres ainda está vazio e o cliente fica preso em 404 (sem retry). */
    await this.vaultFiles.backfillFromGiteaIfEmpty(vault.id, vault.giteaRepo);
    const { content, version } = await this.vaultFiles.getContent(vault.id, filePath);
    return { content, commitHash: version };
  }

  @Get(':id/git/commits')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async listGitCommits(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Query('limit') limitRaw?: string,
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.getVaultForUser(uid, id.trim());
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }
    const limit = Number.parseInt(limitRaw ?? '20', 10);
    const commits = await this.vaultFiles.listRepoCommitsForRestore(
      vault.giteaRepo,
      Number.isFinite(limit) ? limit : 20,
    );
    return { commits };
  }

  @Post(':id/git/restore')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async restoreGitCommit(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: { commit?: string },
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.assertVaultWritableForUser(uid, id.trim());
    const commit = body?.commit?.trim();
    if (!commit) {
      throw new BadRequestException('commit obrigatorio');
    }
    return this.vaultFiles.restoreSnapshotFromRepoCommit(vault.id, vault.giteaRepo, commit);
  }

  /**
   * Leitura explícita da tabela `vault_files` (Postgres) — útil para confirmar persistência após POST /sync.
   * Mesma origem que `git/blob`; resposta inclui metadados para inspeção rápida (curl / ferramentas).
   */
  @Get(':id/files/db')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getVaultFileFromDatabase(
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
    const { path, content, version } = await this.vaultFiles.getContent(
      vault.id,
      filePath,
    );
    const body = content ?? '';
    const bytes = Buffer.byteLength(body, 'utf8');
    this.logger.log(
      `\x1b[36m📂 [vault/db-read]\x1b[0m vault=\x1b[33m${vault.id}\x1b[0m path=\x1b[32m${path}\x1b[0m bytes=\x1b[35m${bytes}\x1b[0m v=\x1b[90m${version}\x1b[0m`,
    );
    return {
      source: 'vault_files',
      vaultId: vault.id,
      path,
      version,
      byteLength: bytes,
      content: body,
    };
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

  /**
   * Upsert incremental de um único arquivo (usuário autenticado via web).
   * Usa versionamento otimista: passa base_version para detectar conflitos (409).
   * O cliente web deve ter lógica de merge em caso de 409 (igual ao app local).
   */
  @Post(':id/files/prepare-put')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async preparePut(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body()
    body: {
      path?: string;
      hash?: string;
      size?: number;
      base_version?: string | null;
    },
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.assertVaultWritableForUser(uid, id.trim());
    const path = body?.path;
    const hash = body?.hash;
    const size = body?.size;
    if (!path?.trim() || typeof hash !== 'string' || typeof size !== 'number') {
      throw new BadRequestException('path, hash e size sao obrigatorios');
    }
    return this.vaultFiles.preparePut(vault.id, path, hash, size, body.base_version);
  }

  @Put(':id/files/uploads/:token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 200, ttl: 60_000 } })
  async uploadBody(
    @Param('id') id: string,
    @Param('token') token: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.assertVaultWritableForUser(uid, id.trim());
    const raw = req.body;
    const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
    return this.vaultFiles.storeUploadBody(vault.id, token, text);
  }

  @Post(':id/files/commit-put')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async commitPut(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: { upload_token?: string },
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.assertVaultWritableForUser(uid, id.trim());
    const tok = body?.upload_token;
    if (!tok?.trim()) {
      throw new BadRequestException('upload_token obrigatorio');
    }
    return this.vaultFiles.commitPut(vault.id, tok);
  }

  @Post(':id/files/rename')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async rename(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body()
    body: { from_path?: string; to_path?: string; base_version?: string },
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.assertVaultWritableForUser(uid, id.trim());
    if (!body?.from_path?.trim() || !body?.to_path?.trim() || body.base_version === undefined) {
      throw new BadRequestException('from_path, to_path e base_version sao obrigatorios');
    }
    return this.vaultFiles.renameWithBaseVersion(vault.id, body.from_path, body.to_path, body.base_version);
  }

  @Post(':id/files/manifest-diff')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async manifestDiff(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: { entries?: Array<{ path: string; hash: string; version: string }> },
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.getVaultForUser(uid, id.trim());
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }
    const entries = body?.entries;
    if (!Array.isArray(entries)) {
      throw new BadRequestException('entries deve ser um array');
    }
    return this.vaultFiles.manifestDiff(vault.id, entries);
  }

  @Post(':id/files/upsert')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async upsertFile(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: { path?: string; content?: string; base_version?: string | null },
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.assertVaultWritableForUser(uid, id.trim());
    const filePath = body?.path;
    const content = body?.content;
    if (!filePath?.trim() || typeof content !== 'string') {
      throw new BadRequestException('path e content obrigatorios');
    }
    return this.vaultFiles.upsertWithBaseVersion(vault.id, filePath, content, body.base_version);
  }

  /**
   * Delete incremental de um arquivo (usuário autenticado via web).
   */
  @Post(':id/files/delete')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async deleteFile(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: { path?: string; base_version?: string },
  ) {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.assertVaultWritableForUser(uid, id.trim());
    const filePath = body?.path;
    if (!filePath?.trim() || body.base_version === undefined) {
      throw new BadRequestException('path e base_version obrigatorios');
    }
    return this.vaultFiles.deleteWithBaseVersion(vault.id, filePath, body.base_version);
  }

  /**
   * Stream SSE para o browser: notifica quando há mudanças no vault.
   * O browser usa esta notificação para invalidar o cache de árvore sem polling cego.
   */
  @Get(':id/events')
  @SkipThrottle()
  async vaultEvents(
    @Param('id') id: string,
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const uid = this.requireUserId(userId);
    const vault = await this.vaultsService.getVaultForUser(uid, id.trim());
    if (!vault) {
      throw new NotFoundException('Vault não encontrado');
    }

    const vid = vault.id;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: VaultSseEvent): void => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeat = setInterval(
      () => send({ type: 'heartbeat', vaultId: vid, ts: Date.now() }),
      30_000,
    );

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = this.vaultSse.subscribe(vid, (cursor) =>
        send({ type: 'change', vaultId: vid, changeId: cursor, cursor }),
      );
    } catch {
      clearInterval(heartbeat);
      reply.raw.writeHead(429, { 'Content-Type': 'application/json' });
      reply.raw.end(JSON.stringify({ message: 'Too many SSE connections for this vault' }));
      return;
    }

    await new Promise<void>((resolve) => {
      reply.raw.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe?.();
        resolve();
      });
      reply.raw.on('error', () => {
        clearInterval(heartbeat);
        unsubscribe?.();
        resolve();
      });
    });
  }
}
