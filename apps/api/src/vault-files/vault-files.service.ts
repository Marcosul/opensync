import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { VaultGitSyncService } from '../sync/vault-git-sync.service';
import { VaultSseService } from './vault-sse.service';
import {
  normalizeVaultRelativePath,
  validateVaultSyncFiles,
  vaultPathLookupCandidates,
  VAULT_MIRROR_DB_PAGE_SIZE,
  VAULT_READ_MAX_BLOB_BYTES,
  VAULT_READ_MAX_TREE_ENTRIES,
} from '../sync/vault-git-sync.service';
import { sanitizeOpenSyncArtifactContent } from './sanitize-merge-markers';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

const CHANGES_PAGE_SIZE = 500;

/** Snapshots percorrem muitas linhas; o timeout default do Prisma (~5s) fecha a tx e gera P2028. */
const SNAPSHOT_TX_MAX_WAIT_MS = 20_000;
const SNAPSHOT_TX_TIMEOUT_MS = 300_000;

/**
 * Hosted Postgres (Neon, RDS, etc.) costuma impor `statement_timeout` baixo; o Prisma só controla
 * o tempo da transacção interactiva — o PG ainda pode cancelar cada UPDATE com 57014.
 * `SET LOCAL` aplica só a esta transacção.
 */
async function setLocalStatementTimeoutMs(
  tx: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> },
  ms: number,
): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${ms}`);
}

/** SHA-256 hex do texto UTF-8 (sync-engine v2 / dedupe prepare-put). */
export function sha256HexUtf8(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function parseBaseVersion(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException('base_version invalido (use inteiro ou omita para ficheiro novo)');
  }
  return n;
}

export type ChangeRowOut = {
  change_id: string;
  path: string;
  version: string;
  deleted: boolean;
  content: string | null;
  updated_at: string;
  /** Presente quando `change_type` no DB é `rename` (sync-engine v2). */
  rename_from?: string | null;
};

@Injectable()
export class VaultFilesService {
  private readonly logger = new Logger(VaultFilesService.name);
  /** Vaults confirmados com linhas em vault_files — elimina COUNT redundante por blob. */
  private readonly _knownNonEmptyVaultIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultGitSync: VaultGitSyncService,
    private readonly vaultSse: VaultSseService,
  ) {}

  async listTree(vaultId: string): Promise<{
    commitHash: string;
    entries: { path: string; size: number; version: string; file_id: string; hash: string | null }[];
  }> {
    const maxId = await this.maxChangeId(vaultId);
    const rows = await this.prisma.vaultFile.findMany({
      where: { vaultId, deletedAt: null },
      select: { path: true, sizeBytes: true, version: true, logicalFileId: true, contentHash: true },
    });
    const entries = rows.map((r) => ({
      path: r.path,
      size: r.sizeBytes ?? 0,
      version: String(r.version),
      file_id: r.logicalFileId,
      hash: r.contentHash,
    }));
    entries.sort((a, b) => a.path.localeCompare(b.path));
    if (entries.length > 5000) {
      throw new BadRequestException('Vault excede 5000 ficheiros');
    }
    return { commitHash: maxId === 0n ? '0' : String(maxId), entries };
  }

  /** Retorna conteúdo completo de todos os ficheiros em uma única query — usado no carregamento inicial do vault. */
  async getAllContents(vaultId: string): Promise<{
    commitHash: string;
    files: { path: string; content: string; version: string }[];
  }> {
    const maxId = await this.maxChangeId(vaultId);
    const rows = await this.prisma.vaultFile.findMany({
      where: { vaultId, deletedAt: null },
      select: { path: true, content: true, version: true, sizeBytes: true },
    });
    const files = rows
      .filter((r) => (r.sizeBytes ?? 0) <= VAULT_READ_MAX_BLOB_BYTES)
      .map((r) => ({
        path: r.path,
        content: sanitizeOpenSyncArtifactContent(r.content ?? ''),
        version: String(r.version),
      }));
    files.sort((a, b) => a.path.localeCompare(b.path));
    if (rows.length > 0) this._knownNonEmptyVaultIds.add(vaultId);
    return { commitHash: maxId === 0n ? '0' : String(maxId), files };
  }

  async getContent(
    vaultId: string,
    rawPath: string,
  ): Promise<{ path: string; content: string; version: string; file_id: string }> {
    const candidates = vaultPathLookupCandidates(rawPath);
    if (candidates.length === 0) {
      throw new BadRequestException('path invalido');
    }
    let row: {
      path: string;
      content: string | null;
      version: number;
      deletedAt: Date | null;
      logicalFileId: string;
    } | null = null;
    for (const path of candidates) {
      const found = await this.prisma.vaultFile.findUnique({
        where: { vaultId_path: { vaultId, path } },
        select: {
          path: true,
          content: true,
          version: true,
          deletedAt: true,
          logicalFileId: true,
        },
      });
      if (found && !found.deletedAt) {
        row = found;
        break;
      }
    }
    if (!row) {
      throw new NotFoundException('Ficheiro nao encontrado');
    }
    const content = sanitizeOpenSyncArtifactContent(row.content ?? '');
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > VAULT_READ_MAX_BLOB_BYTES) {
      throw new BadRequestException(`Ficheiro excede ${VAULT_READ_MAX_BLOB_BYTES} bytes`);
    }
    return {
      path: row.path,
      content,
      version: String(row.version),
      file_id: row.logicalFileId,
    };
  }

  async getChanges(
    vaultId: string,
    cursorRaw: string | undefined,
  ): Promise<{ changes: ChangeRowOut[]; next_cursor: string }> {
    let cursor = 0n;
    if (cursorRaw !== undefined && cursorRaw !== null && String(cursorRaw).trim() !== '') {
      try {
        cursor = BigInt(String(cursorRaw).trim());
      } catch {
        throw new BadRequestException('cursor invalido');
      }
    }
    const rows = await this.prisma.vaultFileChange.findMany({
      where: { vaultId, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: CHANGES_PAGE_SIZE,
    });
    const changes: ChangeRowOut[] = rows.map((r) => {
      const isRename = r.changeType === 'rename';
      let renameFrom: string | null = null;
      if (isRename && r.content) {
        try {
          const meta = JSON.parse(r.content) as { from?: string };
          renameFrom = typeof meta.from === 'string' ? meta.from : null;
        } catch {
          renameFrom = null;
        }
      }
      return {
        change_id: String(r.id),
        path: r.path,
        version: String(r.version),
        deleted: r.changeType === 'delete',
        content:
          r.changeType === 'delete' || r.changeType === 'rename' || r.content == null
            ? r.changeType === 'rename'
              ? null
              : r.content
            : sanitizeOpenSyncArtifactContent(r.content),
        updated_at: r.createdAt.toISOString(),
        ...(isRename ? { rename_from: renameFrom } : {}),
      };
    });
    const last = rows[rows.length - 1];
    const next_cursor = last ? String(last.id) : String(cursor);
    return { changes, next_cursor };
  }

  async upsertWithBaseVersion(
    vaultId: string,
    rawPath: string,
    content: string,
    baseVersionRaw: string | null | undefined,
  ): Promise<{ path: string; version: string; updated_at: string }> {
    const path = normalizeVaultRelativePath(rawPath);
    if (!path) {
      throw new BadRequestException('path invalido');
    }
    content = sanitizeOpenSyncArtifactContent(content);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > VAULT_READ_MAX_BLOB_BYTES) {
      throw new BadRequestException(`Conteudo excede ${VAULT_READ_MAX_BLOB_BYTES} bytes`);
    }
    const baseVersion = parseBaseVersion(baseVersionRaw ?? null);

    const result = await this.prisma.$transaction(
      async (tx) => {
        await setLocalStatementTimeoutMs(tx, SNAPSHOT_TX_TIMEOUT_MS);

        const row = await tx.vaultFile.findUnique({
          where: { vaultId_path: { vaultId, path } },
        });

        if (!row) {
          if (baseVersion !== null) {
            throw new ConflictException({
              message: 'Ficheiro nao existe; omita base_version para criar',
              path,
              currentVersion: null,
            });
          }
          const version = 1;
          const fid = randomUUID();
          const created = await tx.vaultFile.create({
            data: {
              id: fid,
              vaultId,
              path,
              logicalFileId: fid,
              content,
              version,
              sizeBytes: bytes,
              deletedAt: null,
              contentHash: sha256HexUtf8(content),
            },
          });
          await tx.vaultFileChange.create({
            data: {
              vaultId,
              path,
              version,
              changeType: 'upsert',
              content,
            },
          });
          this.logger.log(
            `${colors.green}📄 vault file criado${colors.reset} vault=${vaultId} path=${path} v=${version}`,
          );
          return {
            path,
            version: String(version),
            updated_at: created.updatedAt.toISOString(),
          };
        }

        if (row.deletedAt) {
          const tomb = row.version;
          if (baseVersion !== null && baseVersion !== tomb) {
            throw new ConflictException({
              message: 'Versao remota divergiu',
              path,
              currentVersion: String(tomb),
            });
          }
          const version = tomb + 1;
          const updated = await tx.vaultFile.update({
            where: { vaultId_path: { vaultId, path } },
            data: {
              content,
              version,
              sizeBytes: bytes,
              deletedAt: null,
              contentHash: sha256HexUtf8(content),
            },
          });
          await tx.vaultFileChange.create({
            data: {
              vaultId,
              path,
              version,
              changeType: 'upsert',
              content,
            },
          });
          return {
            path,
            version: String(version),
            updated_at: updated.updatedAt.toISOString(),
          };
        }

        if (baseVersion === null) {
          throw new ConflictException({
            message: 'base_version obrigatorio para ficheiro existente',
            path,
            currentVersion: String(row.version),
          });
        }
        if (baseVersion !== row.version) {
          throw new ConflictException({
            message: 'Versao remota divergiu',
            path,
            currentVersion: String(row.version),
          });
        }

        const version = row.version + 1;
        const updated = await tx.vaultFile.update({
          where: { vaultId_path: { vaultId, path } },
          data: {
            content,
            version,
            sizeBytes: bytes,
            deletedAt: null,
            contentHash: sha256HexUtf8(content),
          },
        });
        await tx.vaultFileChange.create({
          data: {
            vaultId,
            path,
            version,
            changeType: 'upsert',
            content,
          },
        });
        return {
          path,
          version: String(version),
          updated_at: updated.updatedAt.toISOString(),
        };
      },
      {
        maxWait: SNAPSHOT_TX_MAX_WAIT_MS,
        timeout: SNAPSHOT_TX_TIMEOUT_MS,
      },
    );

    // Notificar subscribers SSE após commit (fora da transação)
    void this.notifyVaultChange(vaultId);
    return result;
  }

  async deleteWithBaseVersion(
    vaultId: string,
    rawPath: string,
    baseVersionRaw: string | null | undefined,
  ): Promise<{ path: string; version: string; updated_at: string }> {
    const path = normalizeVaultRelativePath(rawPath);
    if (!path) {
      throw new BadRequestException('path invalido');
    }
    const baseVersion = parseBaseVersion(baseVersionRaw ?? null);
    if (baseVersion === null) {
      throw new BadRequestException('base_version obrigatorio para delete');
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        await setLocalStatementTimeoutMs(tx, SNAPSHOT_TX_TIMEOUT_MS);

        const row = await tx.vaultFile.findUnique({
          where: { vaultId_path: { vaultId, path } },
        });
        if (!row || row.deletedAt) {
          throw new NotFoundException('Ficheiro nao encontrado ou ja removido');
        }
        if (baseVersion !== row.version) {
          throw new ConflictException({
            message: 'Versao remota divergiu',
            path,
            currentVersion: String(row.version),
          });
        }
        const version = row.version + 1;
        const updated = await tx.vaultFile.update({
          where: { vaultId_path: { vaultId, path } },
          data: {
            content: null,
            version,
            sizeBytes: null,
            deletedAt: new Date(),
            contentHash: null,
          },
        });
        await tx.vaultFileChange.create({
          data: {
            vaultId,
            path,
            version,
            changeType: 'delete',
            content: null,
          },
        });
        return {
          path,
          version: String(version),
          updated_at: updated.updatedAt.toISOString(),
        };
      },
      {
        maxWait: SNAPSHOT_TX_MAX_WAIT_MS,
        timeout: SNAPSHOT_TX_TIMEOUT_MS,
      },
    );

    // Notificar subscribers SSE após commit (fora da transação)
    void this.notifyVaultChange(vaultId);
    return result;
  }

  private effectiveContentHash(row: { contentHash: string | null; content: string | null }): string {
    if (row.contentHash && row.contentHash.length > 0) return row.contentHash;
    return sha256HexUtf8(row.content ?? '');
  }

  private readonly uploadPendingTtlMs = 900_000;

  /**
   * Fase 1 do upload em duas fases (sync-engine v2): decide se precisa de bytes ou dedupe / conflito.
   */
  async preparePut(
    vaultId: string,
    rawPath: string,
    expectedContentHash: string,
    expectedSizeBytes: number,
    baseVersionRaw: string | null | undefined,
  ): Promise<
    | { status: 'upload_required'; upload_token: string; expires_at: string }
    | { status: 'already_exists'; new_version: string }
  > {
    const path = normalizeVaultRelativePath(rawPath);
    if (!path) {
      throw new BadRequestException('path invalido');
    }
    const h = String(expectedContentHash).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      throw new BadRequestException('hash deve ser SHA-256 hex (64 caracteres)');
    }
    if (!Number.isInteger(expectedSizeBytes) || expectedSizeBytes < 0 || expectedSizeBytes > VAULT_READ_MAX_BLOB_BYTES) {
      throw new BadRequestException(`size invalido (0..${VAULT_READ_MAX_BLOB_BYTES})`);
    }
    const baseVersion = parseBaseVersion(baseVersionRaw ?? null);

    const row = await this.prisma.vaultFile.findUnique({
      where: { vaultId_path: { vaultId, path } },
    });

    if (!row) {
      if (baseVersion !== null) {
        throw new ConflictException({
          message: 'Ficheiro nao existe; omita base_version para criar',
          path,
          currentVersion: null,
        });
      }
      const pending = await this.prisma.vaultFileUploadPending.create({
        data: {
          vaultId,
          path,
          baseVersion: null,
          expectedContentHash: h,
          expectedSizeBytes,
          expiresAt: new Date(Date.now() + this.uploadPendingTtlMs),
        },
      });
      this.logger.log(
        `${colors.cyan}📤 prepare-put novo ficheiro${colors.reset} vault=${vaultId} path=${path} token=${pending.id}`,
      );
      return {
        status: 'upload_required',
        upload_token: pending.id,
        expires_at: pending.expiresAt.toISOString(),
      };
    }

    if (row.deletedAt) {
      const tomb = row.version;
      if (baseVersion !== null && baseVersion !== tomb) {
        throw new ConflictException({
          message: 'Versao remota divergiu',
          path,
          currentVersion: String(tomb),
        });
      }
      const pending = await this.prisma.vaultFileUploadPending.create({
        data: {
          vaultId,
          path,
          baseVersion: null,
          expectedContentHash: h,
          expectedSizeBytes,
          expiresAt: new Date(Date.now() + this.uploadPendingTtlMs),
        },
      });
      this.logger.log(
        `${colors.cyan}📤 prepare-put revive tombstone${colors.reset} vault=${vaultId} path=${path} token=${pending.id}`,
      );
      return {
        status: 'upload_required',
        upload_token: pending.id,
        expires_at: pending.expiresAt.toISOString(),
      };
    }

    if (baseVersion === null) {
      throw new ConflictException({
        message: 'base_version obrigatorio para ficheiro existente',
        path,
        currentVersion: String(row.version),
      });
    }
    if (baseVersion !== row.version) {
      const serverHash = this.effectiveContentHash(row);
      throw new ConflictException({
        message: 'Versao remota divergiu',
        path,
        currentVersion: String(row.version),
        server_hash: serverHash,
      });
    }

    const serverHash = this.effectiveContentHash(row);
    if (serverHash === h) {
      return { status: 'already_exists', new_version: String(row.version) };
    }

    const pending = await this.prisma.vaultFileUploadPending.create({
      data: {
        vaultId,
        path,
        baseVersion: row.version,
        expectedContentHash: h,
        expectedSizeBytes,
        expiresAt: new Date(Date.now() + this.uploadPendingTtlMs),
      },
    });
    this.logger.log(
      `${colors.green}📤 prepare-put upload${colors.reset} vault=${vaultId} path=${path} token=${pending.id}`,
    );
    return {
      status: 'upload_required',
      upload_token: pending.id,
      expires_at: pending.expiresAt.toISOString(),
    };
  }

  /** Fase 2: grava o corpo UTF-8 na sessão pendente. */
  async storeUploadBody(vaultId: string, uploadToken: string, bodyUtf8: string): Promise<{ ok: true }> {
    const token = uploadToken.trim();
    const now = new Date();
    const n = await this.prisma.vaultFileUploadPending.updateMany({
      where: {
        id: token,
        vaultId,
        expiresAt: { gt: now },
      },
      data: { content: bodyUtf8 },
    });
    if (n.count === 0) {
      throw new NotFoundException('Sessao de upload invalida ou expirada');
    }
    const bytes = Buffer.byteLength(bodyUtf8, 'utf8');
    this.logger.log(
      `${colors.green}🧺 upload body guardado${colors.reset} vault=${vaultId} token=${token} bytes=${bytes}`,
    );
    return { ok: true };
  }

  /** Fase 3: valida hash/tamanho e aplica ao vault. */
  async commitPut(
    vaultId: string,
    uploadToken: string,
  ): Promise<{ path: string; version: string; updated_at: string }> {
    const token = uploadToken.trim();
    const pending = await this.prisma.vaultFileUploadPending.findFirst({
      where: { id: token, vaultId },
    });
    if (!pending) {
      throw new NotFoundException('Sessao de upload invalida');
    }
    if (pending.expiresAt.getTime() <= Date.now()) {
      await this.prisma.vaultFileUploadPending.delete({ where: { id: token } }).catch(() => undefined);
      throw new BadRequestException('Sessao de upload expirada');
    }
    if (pending.content == null) {
      throw new BadRequestException('Corpo ainda nao enviado (PUT upload)');
    }
    const content = sanitizeOpenSyncArtifactContent(pending.content);
    const bytes = Buffer.byteLength(content, 'utf8');
    const hash = sha256HexUtf8(content);
    if (bytes !== pending.expectedSizeBytes || hash !== pending.expectedContentHash) {
      throw new BadRequestException('Hash ou tamanho nao coincidem com prepare-put');
    }

    const baseRaw =
      pending.baseVersion === null || pending.baseVersion === undefined
        ? null
        : String(pending.baseVersion);

    const out = await this.upsertWithBaseVersion(vaultId, pending.path, content, baseRaw);

    await this.prisma.vaultFileUploadPending.delete({ where: { id: token } });
    this.logger.log(
      `${colors.green}✅ commit-put${colors.reset} vault=${vaultId} path=${out.path} v=${out.version}`,
    );
    return out;
  }

  async renameWithBaseVersion(
    vaultId: string,
    rawFrom: string,
    rawTo: string,
    baseVersionRaw: string | null | undefined,
  ): Promise<{ from_path: string; to_path: string; version: string; updated_at: string; file_id: string }> {
    const fromPath = normalizeVaultRelativePath(rawFrom);
    const toPath = normalizeVaultRelativePath(rawTo);
    if (!fromPath || !toPath) {
      throw new BadRequestException('paths invalidos');
    }
    if (fromPath === toPath) {
      throw new BadRequestException('from e to devem ser diferentes');
    }
    const baseVersion = parseBaseVersion(baseVersionRaw ?? null);
    if (baseVersion === null) {
      throw new BadRequestException('base_version obrigatorio para rename');
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        await setLocalStatementTimeoutMs(tx, SNAPSHOT_TX_TIMEOUT_MS);

        const fromRow = await tx.vaultFile.findUnique({
          where: { vaultId_path: { vaultId, path: fromPath } },
        });
        if (!fromRow || fromRow.deletedAt) {
          throw new NotFoundException('Ficheiro origem nao encontrado ou removido');
        }
        if (baseVersion !== fromRow.version) {
          throw new ConflictException({
            message: 'Versao remota divergiu',
            path: fromPath,
            currentVersion: String(fromRow.version),
          });
        }

        const toRow = await tx.vaultFile.findUnique({
          where: { vaultId_path: { vaultId, path: toPath } },
        });
        if (toRow && !toRow.deletedAt) {
          throw new ConflictException({
            message: 'Destino ja existe',
            path: toPath,
            currentVersion: String(toRow.version),
          });
        }
        if (toRow?.deletedAt) {
          await tx.vaultFile.delete({
            where: { vaultId_path: { vaultId, path: toPath } },
          });
        }

        const version = fromRow.version + 1;
        const content = fromRow.content ?? '';
        const bytes = Buffer.byteLength(content, 'utf8');
        const updated = await tx.vaultFile.update({
          where: { vaultId_path: { vaultId, path: fromPath } },
          data: {
            path: toPath,
            version,
            sizeBytes: bytes,
            contentHash: sha256HexUtf8(content),
          },
        });
        await tx.vaultFileChange.create({
          data: {
            vaultId,
            path: toPath,
            version,
            changeType: 'rename',
            content: JSON.stringify({ from: fromPath }),
          },
        });
        return {
          from_path: fromPath,
          to_path: toPath,
          version: String(version),
          updated_at: updated.updatedAt.toISOString(),
          file_id: fromRow.logicalFileId,
        };
      },
      {
        maxWait: SNAPSHOT_TX_MAX_WAIT_MS,
        timeout: SNAPSHOT_TX_TIMEOUT_MS,
      },
    );

    void this.notifyVaultChange(vaultId);
    this.logger.log(
      `${colors.cyan}🔀 rename${colors.reset} vault=${vaultId} ${result.from_path} → ${result.to_path} v=${result.version}`,
    );
    return result;
  }

  async manifestDiff(
    vaultId: string,
    entries: Array<{ path: string; hash: string; version: string }>,
  ): Promise<{
    pull: Array<{ path: string; version: string; hash: string | null }>;
    push: Array<{ path: string; base_version: string }>;
    conflicts: Array<{ path: string; reason: string }>;
  }> {
    const clientByPath = new Map<string, { path: string; hash: string; version: number }>();
    for (const e of entries) {
      const p = normalizeVaultRelativePath(e.path);
      if (!p) continue;
      const vr = Number(String(e.version).trim());
      if (!Number.isInteger(vr) || vr < 0) continue;
      const h = String(e.hash).trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(h)) continue;
      clientByPath.set(p, { path: p, hash: h, version: vr });
    }

    const serverRows = await this.prisma.vaultFile.findMany({
      where: { vaultId },
      select: { path: true, version: true, contentHash: true, content: true, deletedAt: true },
    });
    const serverByPath = new Map<
      string,
      { version: number; deleted: boolean; effHash: string | null }
    >();
    for (const r of serverRows) {
      const deleted = !!r.deletedAt;
      const effHash =
        deleted || !r.content
          ? null
          : r.contentHash && r.contentHash.length > 0
            ? r.contentHash
            : sha256HexUtf8(r.content);
      serverByPath.set(r.path, {
        version: r.version,
        deleted,
        effHash: deleted ? null : effHash,
      });
    }

    const pull: Array<{ path: string; version: string; hash: string | null }> = [];
    const push: Array<{ path: string; base_version: string }> = [];
    const conflicts: Array<{ path: string; reason: string }> = [];

    const allPaths = new Set<string>([...clientByPath.keys(), ...serverByPath.keys()]);

    for (const p of allPaths) {
      const cli = clientByPath.get(p);
      const srv = serverByPath.get(p);

      if (!cli && srv && !srv.deleted) {
        pull.push({ path: p, version: String(srv.version), hash: srv.effHash });
        continue;
      }

      if (cli && !srv) {
        push.push({ path: p, base_version: '0' });
        continue;
      }

      if (cli && srv && srv.deleted) {
        if (cli.version > srv.version) {
          push.push({ path: p, base_version: String(srv.version) });
        } else {
          conflicts.push({ path: p, reason: 'tombstone_remote_newer_or_equal' });
        }
        continue;
      }

      if (!cli) {
        continue;
      }

      if (!srv || srv.deleted) {
        continue;
      }

      const cv = cli.version;
      const sv = srv.version;
      if (cv < sv) {
        pull.push({ path: p, version: String(sv), hash: srv.effHash });
      } else if (cv > sv) {
        push.push({ path: p, base_version: String(sv) });
      } else if (srv.effHash !== cli.hash) {
        conflicts.push({ path: p, reason: 'same_version_hash_mismatch' });
      }
    }

    pull.sort((a, b) => a.path.localeCompare(b.path));
    push.sort((a, b) => a.path.localeCompare(b.path));
    conflicts.sort((a, b) => a.path.localeCompare(b.path));

    this.logger.log(
      `${colors.yellow}📋 manifest-diff${colors.reset} vault=${vaultId} pull=${pull.length} push=${push.length} conflicts=${conflicts.length}`,
    );
    return { pull, push, conflicts };
  }

  /**
   * Sync completo a partir do dashboard (utilizador autenticado): substitui estado do vault pelo mapa.
   */
  async applyTrustedSnapshot(
    vaultId: string,
    files: Record<string, string>,
  ): Promise<{ ok: true; commitHash: string }> {
    const isEmptyPayload =
      files === null ||
      typeof files !== 'object' ||
      Array.isArray(files) ||
      Object.keys(files).length === 0;

    if (process.env.OPENSYNC_VAULT_SYNC_DEBUG === '1') {
      const keys = isEmptyPayload ? [] : Object.keys(files);
      const emptyKeys = keys.filter((k) => (typeof files[k] === 'string' ? files[k].length === 0 : true));
      const totalBytes = keys.reduce((a, k) => a + Buffer.byteLength(String(files[k] ?? ''), 'utf8'), 0);
      this.logger.log(
        `${colors.cyan}📦 applyTrustedSnapshot DEBUG${colors.reset} vault=${vaultId} emptyPayload=${isEmptyPayload} paths=${keys.length} emptyPaths=${emptyKeys.length} bytes≈${totalBytes} sample=${keys.slice(0, 10).join(',')}`,
      );
    }

    const syntheticHash = await this.prisma.$transaction(
      async (tx) => {
        await setLocalStatementTimeoutMs(tx, SNAPSHOT_TX_TIMEOUT_MS);

        let lastChangeId: bigint | null = null;
        const appendChange = async (data: Parameters<typeof tx.vaultFileChange.create>[0]) => {
          const created = await tx.vaultFileChange.create(data);
          if (typeof created.id === 'bigint') {
            lastChangeId = created.id;
          }
          return created;
        };

        if (isEmptyPayload) {
          const active = await tx.vaultFile.findMany({
            where: { vaultId, deletedAt: null },
            select: { path: true, version: true },
          });
          for (const row of active) {
            const version = row.version + 1;
            await tx.vaultFile.update({
              where: { vaultId_path: { vaultId, path: row.path } },
              data: {
                content: null,
                version,
                sizeBytes: null,
                deletedAt: new Date(),
                contentHash: null,
              },
            });
            await appendChange({
              data: {
                vaultId,
                path: row.path,
                version,
                changeType: 'delete',
                content: null,
              },
            });
          }
        } else {
          const wanted = validateVaultSyncFiles(files);
          const wantedPaths = new Set(wanted.keys());

          for (const [path, content] of wanted) {
            const bytes = Buffer.byteLength(content, 'utf8');
            const prev = await tx.vaultFile.findUnique({
              where: { vaultId_path: { vaultId, path } },
            });
            if (!prev) {
              const fid = randomUUID();
              await tx.vaultFile.create({
                data: {
                  id: fid,
                  vaultId,
                  path,
                  logicalFileId: fid,
                  content,
                  version: 1,
                  sizeBytes: bytes,
                  deletedAt: null,
                  contentHash: sha256HexUtf8(content),
                },
              });
              await appendChange({
                data: {
                  vaultId,
                  path,
                  version: 1,
                  changeType: 'upsert',
                  content,
                },
              });
            } else {
              const version = prev.version + 1;
              await tx.vaultFile.update({
                where: { vaultId_path: { vaultId, path } },
                data: {
                  content,
                  version,
                  sizeBytes: bytes,
                  deletedAt: null,
                  contentHash: sha256HexUtf8(content),
                },
              });
              await appendChange({
                data: {
                  vaultId,
                  path,
                  version,
                  changeType: 'upsert',
                  content,
                },
              });
            }
          }

          const afterUpserts = await tx.vaultFile.findMany({
            where: { vaultId, deletedAt: null },
            select: { path: true, version: true },
          });
          for (const row of afterUpserts) {
            if (wantedPaths.has(row.path)) continue;
            const version = row.version + 1;
            await tx.vaultFile.update({
              where: { vaultId_path: { vaultId, path: row.path } },
              data: {
                content: null,
                version,
                sizeBytes: null,
                deletedAt: new Date(),
                contentHash: null,
              },
            });
            await appendChange({
              data: {
                vaultId,
                path: row.path,
                version,
                changeType: 'delete',
                content: null,
              },
            });
          }
        }

        if (lastChangeId !== null) {
          return String(lastChangeId);
        }
        const maxCh = await tx.vaultFileChange.findFirst({
          where: { vaultId },
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        return maxCh ? String(maxCh.id) : '0';
      },
      {
        maxWait: SNAPSHOT_TX_MAX_WAIT_MS,
        timeout: SNAPSHOT_TX_TIMEOUT_MS,
      },
    );

    this.logger.log(
      `${colors.cyan}📦 Snapshot vault aplicado${colors.reset} vault=${vaultId} empty=${isEmptyPayload} tailChange=${syntheticHash}`,
    );

    // Notificar subscribers SSE após commit (fora da transação)
    void this.notifyVaultChange(vaultId, syntheticHash);

    return { ok: true, commitHash: `db:${syntheticHash}` };
  }

  /** Mesmo que applyTrustedSnapshot, mas para token de agente (substitui estado remoto pelo mapa). */
  async applyAgentSnapshot(
    vaultId: string,
    files: Record<string, string>,
  ): Promise<{ ok: true; commitHash: string }> {
    return this.applyTrustedSnapshot(vaultId, files);
  }

  /**
   * Ficheiros activos do vault para espelho Gitea, paginados por `path` (pouca RAM; conteúdos grandes ok).
   */
  async *streamActiveVaultFilesForMirror(
    vaultId: string,
    pageSize: number = VAULT_MIRROR_DB_PAGE_SIZE,
  ): AsyncGenerator<{ rel: string; body: string }> {
    const take = Math.max(1, Math.min(pageSize, 500));
    let cursorPath: string | undefined;
    for (;;) {
      const rows = await this.prisma.vaultFile.findMany({
        where: { vaultId, deletedAt: null },
        orderBy: { path: 'asc' },
        take,
        ...(cursorPath
          ? { skip: 1, cursor: { vaultId_path: { vaultId, path: cursorPath } } }
          : {}),
        select: { path: true, content: true },
      });
      if (rows.length === 0) {
        return;
      }
      for (const r of rows) {
        yield { rel: r.path, body: r.content ?? '' };
      }
      if (rows.length < take) {
        return;
      }
      cursorPath = rows[rows.length - 1]!.path;
    }
  }

  async maxChangeId(vaultId: string): Promise<bigint> {
    const row = await this.prisma.vaultFileChange.findFirst({
      where: { vaultId },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return row?.id ?? 0n;
  }

  /**
   * Notifica subscribers SSE após mutação de vault.
   * @param knownCursor cursor já conhecido (evita query extra); se omitido, busca do DB.
   */
  private async notifyVaultChange(vaultId: string, knownCursor?: string): Promise<void> {
    try {
      const cursor = knownCursor ?? String(await this.maxChangeId(vaultId));
      await this.vaultSse.notify(vaultId, cursor);
    } catch (err) {
      this.logger.warn(`Falha ao notificar SSE vault=${vaultId}: ${String(err)}`);
    }
  }

  /** Primeira abertura: copia estado do Gitea para Postgres se ainda vazio. */
  async backfillFromGiteaIfEmpty(vaultId: string, giteaRepo: string): Promise<void> {
    if (this._knownNonEmptyVaultIds.has(vaultId)) return;
    /** Qualquer linha em vault_files (mesmo soft-deleted) indica que já não é “primeiro uso” — evita re-backfill apagar tudo. */
    const anyRow = await this.prisma.vaultFile.count({ where: { vaultId } });
    if (anyRow > 0) {
      this._knownNonEmptyVaultIds.add(vaultId);
      return;
    }

    const { entries } = await this.vaultGitSync.readRepoTree(giteaRepo);
    if (entries.length === 0) return;
    if (entries.length > VAULT_READ_MAX_TREE_ENTRIES) {
      this.logger.warn(
        `${colors.yellow}⚠️ Backfill skip: demasiados ficheiros${colors.reset} vault=${vaultId}`,
      );
      return;
    }

    const files: Record<string, string> = {};
    for (const e of entries) {
      if (e.path.includes('.git/')) continue;
      try {
        const { content } = await this.vaultGitSync.readRepoBlob(giteaRepo, e.path);
        files[e.path] = content;
      } catch {
        /* skip unreadable */
      }
    }
    if (Object.keys(files).length === 0) return;

    await this.applyTrustedSnapshot(vaultId, files);
    this._knownNonEmptyVaultIds.add(vaultId);
    this.logger.log(
      `${colors.green}📥 Backfill Gitea→Postgres${colors.reset} vault=${vaultId} files=${Object.keys(files).length}`,
    );
  }

  async listRepoCommitsForRestore(
    giteaRepo: string,
    limit: number = 20,
  ): Promise<Array<{ sha: string; message: string; authorName: string; authoredAt: string }>> {
    return this.vaultGitSync.listRepoCommits(giteaRepo, limit);
  }

  async restoreSnapshotFromRepoCommit(
    vaultId: string,
    giteaRepo: string,
    commitRef: string,
  ): Promise<{ ok: true; commitHash: string; importedFiles: number }> {
    const ref = commitRef.trim();
    if (!ref) {
      throw new BadRequestException('commit obrigatorio');
    }
    const { commitHash, entries } = await this.vaultGitSync.readRepoTree(giteaRepo, ref);
    const files: Record<string, string> = {};
    const concurrency = 8;
    for (let i = 0; i < entries.length; i += concurrency) {
      const chunk = entries.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (entry) => {
          const blob = await this.vaultGitSync.readRepoBlob(giteaRepo, entry.path, commitHash);
          files[entry.path] = blob.content;
        }),
      );
    }
    this.logger.log(
      `${colors.cyan}🛟 [restore] aplicando commit${colors.reset} vault=${vaultId} ref=${commitHash.slice(0, 12)} files=${entries.length}`,
    );
    const applied = await this.applyTrustedSnapshot(vaultId, files);
    this.logger.log(
      `${colors.green}✅ [restore] commit restaurado${colors.reset} vault=${vaultId} from=${commitHash.slice(0, 12)} to=${applied.commitHash}`,
    );
    return { ok: true, commitHash: applied.commitHash, importedFiles: entries.length };
  }
}
