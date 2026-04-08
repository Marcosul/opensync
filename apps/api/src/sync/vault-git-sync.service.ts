import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';

import { GiteaService } from './gitea.service';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

/** Limite total aproximado do payload UTF-8 (soma dos conteúdos). */
export const VAULT_SYNC_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

/** Limite por ficheiro na leitura `git/blob` (UTF-8). */
export const VAULT_READ_MAX_BLOB_BYTES = 1024 * 1024;

/** Máximo de entradas devolvidas por `git/tree`. */
export const VAULT_READ_MAX_TREE_ENTRIES = 5000;

export type VaultGitTreeEntry = {
  path: string;
  size: number;
};

export function normalizeVaultRelativePath(raw: string): string | null {
  const s = raw.trim().replace(/\\/g, '/');
  if (!s || s.startsWith('/') || /^[a-zA-Z]:/.test(s)) return null;
  const parts = s.split('/').filter((p) => p.length > 0);
  for (const p of parts) {
    if (p === '.' || p === '..') return null;
  }
  return parts.join('/');
}

export function validateVaultSyncFiles(
  files: Record<string, string>,
): Map<string, string> {
  if (files === null || typeof files !== 'object' || Array.isArray(files)) {
    throw new BadRequestException('files deve ser um objeto path -> conteudo');
  }
  const out = new Map<string, string>();
  let total = 0;
  for (const [rawKey, content] of Object.entries(files)) {
    if (typeof content !== 'string') {
      throw new BadRequestException('Cada ficheiro deve ter conteudo string');
    }
    const normalized = normalizeVaultRelativePath(rawKey);
    if (!normalized) {
      throw new BadRequestException(`Path invalido: ${rawKey}`);
    }
    total += Buffer.byteLength(content, 'utf8');
    if (total > VAULT_SYNC_MAX_PAYLOAD_BYTES) {
      throw new BadRequestException(
        `Payload excede ${VAULT_SYNC_MAX_PAYLOAD_BYTES} bytes`,
      );
    }
    out.set(normalized, content);
  }
  return out;
}

@Injectable()
export class VaultGitSyncService {
  private readonly logger = new Logger(VaultGitSyncService.name);

  constructor(private readonly gitea: GiteaService) {}

  async pushTextFiles(
    repoFullName: string,
    files: Record<string, string>,
  ): Promise<{ commitHash: string }> {
    const wanted = validateVaultSyncFiles(files);
    const cloneUrl = this.gitea.buildAuthenticatedCloneUrl(repoFullName);
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opensync-vault-sync-'));

    try {
      const git = simpleGit({ baseDir: tmpRoot });
      this.logger.log(
        `${colors.cyan}📥 Clone shallow do repo:${colors.reset} ${repoFullName}`,
      );
      await git.clone(cloneUrl, '.', ['--depth', '1']);

      await git.addConfig('user.email', 'opensync@opensync.local');
      await git.addConfig('user.name', 'OpenSync');

      const tracked = await this.listTrackedFiles(git);
      const wantedPaths = new Set(wanted.keys());

      for (const rel of tracked) {
        if (!wantedPaths.has(rel)) {
          await git.raw(['rm', '-f', '--ignore-unmatch', rel]);
        }
      }

      for (const [rel, body] of wanted) {
        const abs = path.join(tmpRoot, rel);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, body, 'utf8');
      }

      await git.add(['-A']);
      const stagedNames = (await git.raw(['diff', '--cached', '--name-only'])).trim();
      if (!stagedNames) {
        const commitHash = (await git.revparse(['HEAD'])).trim();
        this.logger.log(
          `${colors.yellow}ℹ️ Nada a commitar (ja sincronizado):${colors.reset} ${commitHash.slice(0, 7)}`,
        );
        return { commitHash };
      }

      await git.commit('chore(vault): sync snapshot');
      const commitHash = (await git.revparse(['HEAD'])).trim();

      this.logger.log(
        `${colors.cyan}📤 Push para Gitea:${colors.reset} ${repoFullName} ${commitHash.slice(0, 7)}`,
      );
      await git.push('origin', 'HEAD');

      this.logger.log(
        `${colors.green}✅ Sync vault concluido:${colors.reset} ${commitHash}`,
      );
      return { commitHash };
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}❌ Falha no sync git:${colors.reset} ${hint}`,
      );
      throw new BadGatewayException(`Falha ao sincronizar com Gitea: ${hint}`);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {
        /* ignore */
      });
    }
  }

  /**
   * Lista caminhos relativos rastreados pelo git (exclui .git).
   */
  private async listTrackedFiles(git: SimpleGit): Promise<string[]> {
    const out = await git.raw(['ls-files', '-z']);
    if (!out) return [];
    return out
      .split('\0')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((rel) => normalizeVaultRelativePath(rel))
      .filter((r): r is string => r !== null);
  }

  /**
   * Clone shallow read-only e lista blobs em HEAD (explorador lazy).
   */
  async readRepoTree(repoFullName: string): Promise<{
    commitHash: string;
    entries: VaultGitTreeEntry[];
  }> {
    const cloneUrl = this.gitea.buildAuthenticatedCloneUrl(repoFullName);
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opensync-vault-read-tree-'));
    try {
      const git = simpleGit({ baseDir: tmpRoot });
      this.logger.log(
        `${colors.cyan}📂 Leitura arvore (clone shallow):${colors.reset} ${repoFullName}`,
      );
      await git.clone(cloneUrl, '.', ['--depth', '1']);
      const commitHash = (await git.revparse(['HEAD'])).trim();
      const raw = await git.raw(['ls-tree', '-r', '-l', 'HEAD']);
      const entries: VaultGitTreeEntry[] = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const tab = trimmed.indexOf('\t');
        if (tab < 0) continue;
        const left = trimmed.slice(0, tab).split(/\s+/);
        const filePath = trimmed.slice(tab + 1);
        if (left.length < 4 || left[1] !== 'blob') continue;
        const sizeRaw = left[3];
        if (sizeRaw === '-') continue;
        const size = Number(sizeRaw);
        if (!Number.isFinite(size) || size < 0) continue;
        const norm = normalizeVaultRelativePath(filePath);
        if (!norm) continue;
        entries.push({ path: norm, size });
      }
      if (entries.length > VAULT_READ_MAX_TREE_ENTRIES) {
        throw new BadRequestException(
          `Repositorio excede ${VAULT_READ_MAX_TREE_ENTRIES} ficheiros rastreados`,
        );
      }
      this.logger.log(
        `${colors.green}✅ Arvore:${colors.reset} ${entries.length} ficheiros @ ${commitHash.slice(0, 7)}`,
      );
      return { commitHash, entries };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}❌ Falha ao ler arvore git:${colors.reset} ${hint}`,
      );
      throw new BadGatewayException(`Falha ao ler arvore do Gitea: ${hint}`);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {
        /* ignore */
      });
    }
  }

  /**
   * Conteúdo UTF-8 de um blob em HEAD (clone shallow).
   */
  async readRepoBlob(
    repoFullName: string,
    rawPath: string,
  ): Promise<{ content: string; commitHash: string }> {
    const norm = normalizeVaultRelativePath(rawPath);
    if (!norm) {
      throw new BadRequestException('path invalido');
    }
    const cloneUrl = this.gitea.buildAuthenticatedCloneUrl(repoFullName);
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opensync-vault-read-blob-'));
    try {
      const git = simpleGit({ baseDir: tmpRoot });
      this.logger.log(
        `${colors.cyan}📄 Leitura blob:${colors.reset} ${repoFullName} :: ${norm}`,
      );
      await git.clone(cloneUrl, '.', ['--depth', '1']);
      const commitHash = (await git.revparse(['HEAD'])).trim();
      let content: string;
      try {
        content = await git.show([`HEAD:${norm}`]);
      } catch {
        throw new NotFoundException('Ficheiro nao encontrado no repositorio');
      }
      if (typeof content !== 'string') {
        throw new BadRequestException('Resposta git inesperada');
      }
      if (content.includes('\0')) {
        throw new BadRequestException('Ficheiro binario nao suportado');
      }
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > VAULT_READ_MAX_BLOB_BYTES) {
        throw new HttpException(
          `Ficheiro excede ${VAULT_READ_MAX_BLOB_BYTES} bytes`,
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }
      return { content, commitHash };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      if (err instanceof HttpException && err.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE) {
        throw err;
      }
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}❌ Falha ao ler blob git:${colors.reset} ${hint}`,
      );
      throw new BadGatewayException(`Falha ao ler ficheiro do Gitea: ${hint}`);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {
        /* ignore */
      });
    }
  }
}
