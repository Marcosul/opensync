import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { VaultGitSyncService } from '../sync/vault-git-sync.service';
import {
  normalizeVaultRelativePath,
  validateVaultSyncFiles,
  VAULT_READ_MAX_BLOB_BYTES,
  VAULT_READ_MAX_TREE_ENTRIES,
  VAULT_SYNC_MAX_PAYLOAD_BYTES,
} from '../sync/vault-git-sync.service';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

const CHANGES_PAGE_SIZE = 500;

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
    const path = normalizeVaultRelativePath(rawPath);
    if (!path) {
      throw new BadRequestException('path invalido');
    }
    const row = await this.prisma.vaultFile.findUnique({
      where: { vaultId_path: { vaultId, path } },
    });
    if (!row || row.deletedAt) {
      throw new NotFoundException('Ficheiro nao encontrado');
    }
    const content = row.content ?? '';
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > VAULT_READ_MAX_BLOB_BYTES) {
      throw new BadRequestException(`Ficheiro excede ${VAULT_READ_MAX_BLOB_BYTES} bytes`);
    }
    return { path, content, version: String(row.version) };
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
      content: r.content,
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
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > VAULT_READ_MAX_BLOB_BYTES) {
      throw new BadRequestException(`Conteudo excede ${VAULT_READ_MAX_BLOB_BYTES} bytes`);
    }
    const baseVersion = parseBaseVersion(baseVersionRaw ?? null);

    return this.prisma.$transaction(async (tx) => {
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
    });
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

    return this.prisma.$transaction(async (tx) => {
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
    });
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

    const syntheticHash = await this.prisma.$transaction(async (tx) => {
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
          await tx.vaultFileChange.create({
            data: {
              vaultId,
              path: row.path,
              version,
              changeType: 'delete',
              content: null,
            },
          });
        }
        const maxCh = await tx.vaultFileChange.findFirst({
          where: { vaultId },
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        return maxCh ? String(maxCh.id) : '0';
      }

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
          await tx.vaultFileChange.create({
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
          await tx.vaultFileChange.create({
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
        await tx.vaultFileChange.create({
          data: {
            vaultId,
            path: row.path,
            version,
            changeType: 'delete',
            content: null,
          },
        });
      }

      const maxCh = await tx.vaultFileChange.findFirst({
        where: { vaultId },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      return maxCh ? String(maxCh.id) : '0';
    });

    this.logger.log(
      `${colors.cyan}📦 Snapshot vault aplicado${colors.reset} vault=${vaultId} empty=${isEmptyPayload} tailChange=${syntheticHash}`,
    );

    return { ok: true, commitHash: `db:${syntheticHash}` };
  }

  /** Mesmo que applyTrustedSnapshot, mas para token de agente (substitui estado remoto pelo mapa). */
  async applyAgentSnapshot(
    vaultId: string,
    files: Record<string, string>,
  ): Promise<{ ok: true; commitHash: string }> {
    return this.applyTrustedSnapshot(vaultId, files);
  }

  /** Mapa path -> conteudo para espelho Gitea (ficheiros nao apagados). */
  async buildFilesMapForMirror(vaultId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.vaultFile.findMany({
      where: { vaultId, deletedAt: null },
      select: { path: true, content: true },
    });
    const out: Record<string, string> = {};
    let total = 0;
    for (const r of rows) {
      const c = r.content ?? '';
      total += Buffer.byteLength(c, 'utf8');
      if (total > VAULT_SYNC_MAX_PAYLOAD_BYTES) {
        throw new BadRequestException(
          `Espelho Gitea excede ${VAULT_SYNC_MAX_PAYLOAD_BYTES} bytes; reduza o vault`,
        );
      }
      out[r.path] = c;
    }
    return out;
  }

  async maxChangeId(vaultId: string): Promise<bigint> {
    const row = await this.prisma.vaultFileChange.findFirst({
      where: { vaultId },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return row?.id ?? 0n;
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
