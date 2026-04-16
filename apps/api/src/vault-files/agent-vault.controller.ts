import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PrismaService } from '../common/prisma.service';
import { resolveVaultWithAgentBearer } from '../common/agent-vault.resolve';
import { VaultFilesService } from './vault-files.service';
import { VaultSseService } from './vault-sse.service';
import type { VaultSseEvent } from '../contracts/vault-sse-event';

@Controller('agent/vaults')
@UseGuards(ThrottlerGuard)
export class AgentVaultController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultFiles: VaultFilesService,
    private readonly vaultSse: VaultSseService,
  ) {}

  /**
   * Stream SSE: notifica o cliente local quando há mudanças no vault.
   * O cliente usa esta notificação para acionar imediatamente o poll de /changes,
   * eliminando a necessidade de polling cego periódico.
   * Emite heartbeat a cada 30s para manter a conexão viva através de proxies.
   */
  @Get(':vaultId/events')
  @SkipThrottle()
  async events(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);

    const vid = vaultId.trim();
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
      // Limite de conexões atingido — retorna 429 e fecha
      clearInterval(heartbeat);
      reply.raw.writeHead(429, { 'Content-Type': 'application/json' });
      reply.raw.end(JSON.stringify({ message: 'Too Many SSE connections for this vault' }));
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

  @Post(':vaultId/files/prepare-put')
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  async preparePut(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      path?: string;
      hash?: string;
      size?: number;
      base_version?: string | null;
    },
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    const path = body?.path;
    const hash = body?.hash;
    const size = body?.size;
    if (!path?.trim() || typeof hash !== 'string' || typeof size !== 'number') {
      throw new BadRequestException('path, hash e size sao obrigatorios');
    }
    return this.vaultFiles.preparePut(vaultId.trim(), path, hash, size, body.base_version);
  }

  @Put(':vaultId/files/uploads/:token')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async uploadBody(
    @Param('vaultId') vaultId: string,
    @Param('token') token: string,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    const raw = req.body;
    const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
    return this.vaultFiles.storeUploadBody(vaultId.trim(), token, text);
  }

  @Post(':vaultId/files/commit-put')
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  async commitPut(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { upload_token?: string },
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    const tok = body?.upload_token;
    if (!tok?.trim()) {
      throw new BadRequestException('upload_token obrigatorio');
    }
    return this.vaultFiles.commitPut(vaultId.trim(), tok);
  }

  @Post(':vaultId/files/rename')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async rename(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: { from_path?: string; to_path?: string; base_version?: string },
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    if (!body?.from_path?.trim() || !body?.to_path?.trim() || body.base_version === undefined) {
      throw new BadRequestException('from_path, to_path e base_version sao obrigatorios');
    }
    return this.vaultFiles.renameWithBaseVersion(
      vaultId.trim(),
      body.from_path,
      body.to_path,
      body.base_version,
    );
  }

  @Post(':vaultId/files/manifest-diff')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async manifestDiff(
    @Param('vaultId') vaultId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { entries?: Array<{ path: string; hash: string; version: string }> },
  ) {
    await resolveVaultWithAgentBearer(this.prisma, vaultId.trim(), authorization);
    const entries = body?.entries;
    if (!Array.isArray(entries)) {
      throw new BadRequestException('entries deve ser um array');
    }
    return this.vaultFiles.manifestDiff(vaultId.trim(), entries);
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
