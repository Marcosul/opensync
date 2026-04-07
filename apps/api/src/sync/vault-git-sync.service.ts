import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
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
}
