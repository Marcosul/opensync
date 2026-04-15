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
};

@Injectable()
export class VaultFilesService {
  private readonly logger = new Logger(VaultFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultGitSync: VaultGitSyncService,
    private readonly vaultSse: VaultSseService,
  ) {}

  async listTree(vaultId: string): Promise<{
    commitHash: string;
    entries: { path: string; size: number; version: string }[];
  }> {
    const maxId = await this.maxChangeId(vaultId);
    const rows = await this.prisma.vaultFile.findMany({
      where: { vaultId, deletedAt: null },
      select: { path: true, sizeBytes: true, version: true },
    });
    const entries = rows.map((r) => ({
      path: r.path,
      size: r.sizeBytes ?? 0,
      version: String(r.version),
    }));
    entries.sort((a, b) => a.path.localeCompare(b.path));
    if (entries.length > 5000) {
      throw new BadRequestException('Vault excede 5000 ficheiros');
    }
    return { commitHash: maxId === 0n ? '0' : String(maxId), entries };
  }

  async getContent(vaultId: string, rawPath: string): Promise<{ path: string; content: string; version: string }> {
    const candidates = vaultPathLookupCandidates(rawPath);
    if (candidates.length === 0) {
      throw new BadRequestException('path invalido');
    }
    let row: {
      path: string;
      content: string | null;
      version: number;
      deletedAt: Date | null;
    } | null = null;
    for (const path of candidates) {
      const found = await this.prisma.vaultFile.findUnique({
        where: { vaultId_path: { vaultId, path } },
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
    return { path: row.path, content, version: String(row.version) };
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
    const changes: ChangeRowOut[] = rows.map((r) => ({
      change_id: String(r.id),
      path: r.path,
      version: String(r.version),
      deleted: r.changeType === 'delete',
      content:
        r.changeType === 'delete' || r.content == null
          ? r.content
          : sanitizeOpenSyncArtifactContent(r.content),
      updated_at: r.createdAt.toISOString(),
    }));
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
          const created = await tx.vaultFile.create({
            data: {
              vaultId,
              path,
              content,
              version,
              sizeBytes: bytes,
              deletedAt: null,
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
              await tx.vaultFile.create({
                data: {
                  vaultId,
                  path,
                  content,
                  version: 1,
                  sizeBytes: bytes,
                  deletedAt: null,
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
    /** Qualquer linha em vault_files (mesmo soft-deleted) indica que já não é “primeiro uso” — evita re-backfill apagar tudo. */
    const anyRow = await this.prisma.vaultFile.count({ where: { vaultId } });
    if (anyRow > 0) return;

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
    this.logger.log(
      `${colors.green}📥 Backfill Gitea→Postgres${colors.reset} vault=${vaultId} files=${Object.keys(files).length}`,
    );
  }
}
