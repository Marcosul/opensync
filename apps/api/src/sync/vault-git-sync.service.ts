import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createWriteStream, promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { finished } from 'stream/promises';
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
export const VAULT_SYNC_MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;

/** Limite por ficheiro na leitura `git/blob` (UTF-8). */
export const VAULT_READ_MAX_BLOB_BYTES = 1024 * 1024;

/** Máximo de entradas devolvidas por `git/tree`. */
export const VAULT_READ_MAX_TREE_ENTRIES = 5000;

/** Tamanho máximo do patch UTF-8 em `diffRepoCommit` (resposta API). */
export const VAULT_COMMIT_DIFF_MAX_BYTES = 512 * 1024;

/** Tamanho máximo de cada `write()` ao gravar um ficheiro no clone do mirror (UTF-8 em Buffer). */
export const VAULT_MIRROR_DISK_WRITE_CHUNK_BYTES = 512 * 1024;

/** Linhas `vault_files` por query ao espelhar (evita mapa path→conteúdo gigante em RAM). */
export const VAULT_MIRROR_DB_PAGE_SIZE = 64;

/** Push pode falhar se outro processo actualizou `main` entre o clone e o push (Gitea: remote rejected / cannot lock ref). */
const GIT_PUSH_MAX_ATTEMPTS = 5;

/**
 * Grava texto UTF-8 em disco: ficheiros grandes são escritos em subarrays para não depender de um único write gigante.
 */
export async function writeUtf8FileInChunks(absFilePath: string, utf8: string): Promise<void> {
  await fs.mkdir(path.dirname(absFilePath), { recursive: true });
  const buf = Buffer.from(utf8, 'utf8');
  if (buf.length <= VAULT_MIRROR_DISK_WRITE_CHUNK_BYTES) {
    await fs.writeFile(absFilePath, buf);
    return;
  }
  const ws = createWriteStream(absFilePath, { flags: 'w' });
  try {
    const step = VAULT_MIRROR_DISK_WRITE_CHUNK_BYTES;
    for (let i = 0; i < buf.length; i += step) {
      const slice = buf.subarray(i, Math.min(i + step, buf.length));
      if (!ws.write(slice)) {
        await new Promise<void>((resolve, reject) => {
          ws.once('drain', resolve);
          ws.once('error', reject);
        });
      }
    }
  } finally {
    ws.end();
    await finished(ws);
  }
}

export type VaultGitTreeEntry = {
  path: string;
  size: number;
};
export type VaultGitCommitEntry = {
  sha: string;
  message: string;
  authorName: string;
  authoredAt: string;
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

/**
 * Variantes de path para o mesmo ficheiro no espelho OpenClaw (árvore Git vs linhas antigas em `vault_files`).
 * Ex.: repo com `workspace/memory/x.md` na raiz vs entrada `openclaw/workspace/memory/x.md` na BD.
 */
export function vaultPathLookupCandidates(raw: string): string[] {
  const path = normalizeVaultRelativePath(raw);
  if (!path) return [];
  const out = new Set<string>([path]);
  if (path.startsWith('workspace/')) {
    out.add(`openclaw/${path}`);
  }
  if (path.startsWith('openclaw/workspace/')) {
    out.add(path.slice('openclaw/'.length));
  }
  return [...out];
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

/** Igual a validateVaultSyncFiles mas permite mapa vazio (espelho Gitea sem ficheiros). */
export function validateVaultMirrorFiles(
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

  /** Erros de corrida no remoto (outro push / mirror) onde um novo clone costuma resolver. */
  private isRetryableGitPushError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      msg.includes('non-fast-forward') ||
      msg.includes('failed to push') ||
      msg.includes('remote rejected') ||
      msg.includes('cannot lock ref') ||
      msg.includes('! [remote rejected]') ||
      msg.includes('failed to update ref') ||
      msg.includes('could not read ref')
    );
  }

  async pushTextFiles(
    repoFullName: string,
    files: Record<string, string>,
  ): Promise<{ commitHash: string }> {
    const wanted = validateVaultSyncFiles(files);
    const cloneUrl = this.gitea.buildAuthenticatedCloneUrl(repoFullName);

    pushAttempt: for (let attempt = 1; attempt <= GIT_PUSH_MAX_ATTEMPTS; attempt++) {
      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opensync-vault-sync-'));
      try {
        const git = simpleGit({ baseDir: tmpRoot });
        this.logger.log(
          `${colors.cyan}📥 Clone shallow do repo:${colors.reset} ${repoFullName} (tentativa ${attempt}/${GIT_PUSH_MAX_ATTEMPTS})`,
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
          await writeUtf8FileInChunks(abs, body);
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
        try {
          await git.push('origin', 'HEAD');
        } catch (pushErr) {
          if (
            attempt < GIT_PUSH_MAX_ATTEMPTS &&
            this.isRetryableGitPushError(pushErr)
          ) {
            this.logger.warn(
              `${colors.yellow}🔁 Push recusado (corrida no remote); novo clone e retry…${colors.reset} ${repoFullName}`,
            );
            await new Promise((r) => setTimeout(r, 120 * attempt));
            continue pushAttempt;
          }
          throw pushErr;
        }

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

    throw new BadGatewayException(
      `Falha ao sincronizar com Gitea após ${GIT_PUSH_MAX_ATTEMPTS} tentativas`,
    );
  }

  /**
   * Espelho Postgres → Gitea: consome um async iterable (paginação na BD), grava cada ficheiro em chunks,
   * e remove do git tudo o que não foi escrito neste ciclo. Sem limite de “payload total” em RAM.
   *
   * `fileBodies` é uma fábrica para permitir várias tentativas de push (corrida com outro clone/push).
   */
  async pushMirrorTextFilesStreamed(
    repoFullName: string,
    fileBodies: () => AsyncIterable<{ rel: string; body: string }>,
  ): Promise<{ commitHash: string }> {
    const cloneUrl = this.gitea.buildAuthenticatedCloneUrl(repoFullName);

    mirrorAttempt: for (let attempt = 1; attempt <= GIT_PUSH_MAX_ATTEMPTS; attempt++) {
      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opensync-vault-mirror-'));

      try {
        const git = simpleGit({ baseDir: tmpRoot });
        this.logger.log(
          `${colors.cyan}🪞 Mirror clone (stream+buffer):${colors.reset} ${repoFullName} (tentativa ${attempt}/${GIT_PUSH_MAX_ATTEMPTS})`,
        );
        await git.clone(cloneUrl, '.', ['--depth', '1']);

        await git.addConfig('user.email', 'opensync@opensync.local');
        await git.addConfig('user.name', 'OpenSync');

        const tracked = await this.listTrackedFiles(git);
        const written = new Set<string>();

        for await (const { rel, body } of fileBodies()) {
          const norm = normalizeVaultRelativePath(rel);
          if (!norm) {
            throw new BadRequestException(`Path invalido no stream de mirror: ${rel}`);
          }
          if (typeof body !== 'string') {
            throw new BadRequestException('Cada ficheiro deve ter conteudo string');
          }
          const abs = path.join(tmpRoot, norm);
          await writeUtf8FileInChunks(abs, body);
          written.add(norm);
        }

        for (const tr of tracked) {
          if (!written.has(tr)) {
            await git.raw(['rm', '-f', '--ignore-unmatch', tr]);
          }
        }

        await git.add(['-A']);
        const stagedNames = (await git.raw(['diff', '--cached', '--name-only'])).trim();
        if (!stagedNames) {
          const commitHash = (await git.revparse(['HEAD'])).trim();
          return { commitHash };
        }

        await git.commit('chore(vault): mirror from postgres');
        const commitHash = (await git.revparse(['HEAD'])).trim();

        try {
          await git.push('origin', 'HEAD');
        } catch (pushErr) {
          if (
            attempt < GIT_PUSH_MAX_ATTEMPTS &&
            this.isRetryableGitPushError(pushErr)
          ) {
            this.logger.warn(
              `${colors.yellow}🔁 Mirror: push recusado (corrida no remote); novo clone…${colors.reset} ${repoFullName}`,
            );
            await new Promise((r) => setTimeout(r, 120 * attempt));
            continue mirrorAttempt;
          }
          throw pushErr;
        }

        this.logger.log(
          `${colors.green}✅ Mirror Gitea ok:${colors.reset} ${repoFullName} ${commitHash.slice(0, 7)} files=${written.size}`,
        );
        return { commitHash };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        const hint = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `${colors.red}❌ Falha no mirror Gitea:${colors.reset} ${hint}`,
        );
        throw new BadGatewayException(`Falha no mirror Gitea: ${hint}`);
      } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {
          /* ignore */
        });
      }
    }

    throw new BadGatewayException(
      `Falha no mirror Gitea após ${GIT_PUSH_MAX_ATTEMPTS} tentativas`,
    );
  }

  /** Espelho assíncrono Postgres → Gitea; mapa completo (valida tamanho total do payload). */
  async pushMirrorTextFiles(
    repoFullName: string,
    files: Record<string, string>,
  ): Promise<{ commitHash: string }> {
    const wanted = validateVaultMirrorFiles(files);
    return this.pushMirrorTextFilesStreamed(repoFullName, () =>
      (async function* () {
        for (const [rel, body] of wanted) {
          yield { rel, body };
        }
      })(),
    );
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
  }>;
  async readRepoTree(
    repoFullName: string,
    ref: string,
  ): Promise<{ commitHash: string; entries: VaultGitTreeEntry[] }>;
  async readRepoTree(
    repoFullName: string,
    ref?: string,
  ): Promise<{ commitHash: string; entries: VaultGitTreeEntry[] }> {
    const cloneUrl = this.gitea.buildAuthenticatedCloneUrl(repoFullName);
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opensync-vault-read-tree-'));
    try {
      const git = simpleGit({ baseDir: tmpRoot });
      this.logger.log(
        `${colors.cyan}📂 Leitura arvore (clone shallow):${colors.reset} ${repoFullName}`,
      );
      await git.clone(cloneUrl, '.', ['--depth', '80']);
      const targetRef = ref?.trim() ? ref.trim() : 'HEAD';
      const commitHash = (await git.revparse([targetRef])).trim();
      const raw = await git.raw(['ls-tree', '-r', '-l', targetRef]);
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
        `${colors.green}✅ Arvore:${colors.reset} ${entries.length} ficheiros @ ${commitHash.slice(0, 7)} (${targetRef})`,
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
  ): Promise<{ content: string; commitHash: string }>;
  async readRepoBlob(
    repoFullName: string,
    rawPath: string,
    ref: string,
  ): Promise<{ content: string; commitHash: string }>;
  async readRepoBlob(
    repoFullName: string,
    rawPath: string,
    ref?: string,
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
      await git.clone(cloneUrl, '.', ['--depth', '80']);
      const targetRef = ref?.trim() ? ref.trim() : 'HEAD';
      const commitHash = (await git.revparse([targetRef])).trim();
      let content: string;
      try {
        content = await git.show([`${targetRef}:${norm}`]);
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

  async listRepoCommits(
    repoFullName: string,
    limit: number = 20,
  ): Promise<VaultGitCommitEntry[]> {
    const take = Math.max(1, Math.min(limit, 50));
    const cloneUrl = this.gitea.buildAuthenticatedCloneUrl(repoFullName);
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opensync-vault-read-commits-'));
    try {
      const git = simpleGit({ baseDir: tmpRoot });
      await git.clone(cloneUrl, '.', ['--depth', String(Math.max(80, take + 20))]);
      const raw = await git.raw([
        'log',
        `-n${take}`,
        '--date=iso-strict',
        '--pretty=format:%H%x1f%an%x1f%aI%x1f%s',
      ]);
      const commits = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [sha, authorName, authoredAt, message] = line.split('\x1f');
          return {
            sha: sha ?? '',
            authorName: authorName ?? 'unknown',
            authoredAt: authoredAt ?? new Date(0).toISOString(),
            message: message ?? '(sem mensagem)',
          } satisfies VaultGitCommitEntry;
        })
        .filter((c) => c.sha.length > 0);
      this.logger.log(
        `${colors.cyan}🧾 [restore] commits listados${colors.reset} repo=${repoFullName} count=${commits.length}`,
      );
      return commits;
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}❌ [restore] falha ao listar commits${colors.reset} repo=${repoFullName} err=${hint}`,
      );
      throw new BadGatewayException(`Falha ao listar commits no Gitea: ${hint}`);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {
        /* ignore */
      });
    }
  }

  /**
   * Patch unificado do commit (mensagem + diff), clone raso alinhado a `listRepoCommits`.
   */
  async diffRepoCommit(
    repoFullName: string,
    commitSha: string,
  ): Promise<{ patch: string; truncated: boolean }> {
    const sha = commitSha.trim();
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
      throw new BadRequestException('commit sha invalido');
    }
    const cloneUrl = this.gitea.buildAuthenticatedCloneUrl(repoFullName);
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opensync-vault-diff-commit-'));
    try {
      const git = simpleGit({ baseDir: tmpRoot });
      await git.clone(cloneUrl, '.', ['--depth', '100']);
      let raw: string;
      try {
        raw = await git.raw(['show', '--no-color', '--pretty=medium', sha]);
      } catch (err) {
        const hint = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `${colors.red}❌ [diff] git show falhou${colors.reset} repo=${repoFullName} sha=${sha.slice(0, 12)} err=${hint}`,
        );
        throw new BadGatewayException(
          `Nao foi possivel obter o diff deste commit (repo raso ou commit desconhecido): ${hint}`,
        );
      }
      if (raw.includes('\0')) {
        throw new BadRequestException('Diff contem dados binarios nao suportados');
      }
      const bytes = Buffer.byteLength(raw, 'utf8');
      if (bytes <= VAULT_COMMIT_DIFF_MAX_BYTES) {
        this.logger.log(
          `${colors.cyan}📎 [diff] patch${colors.reset} repo=${repoFullName} sha=${sha.slice(0, 12)} bytes=${bytes} truncated=false`,
        );
        return { patch: raw, truncated: false };
      }
      const suffix = '\n\n[... diff truncado pelo servidor ...]\n';
      const maxBody = VAULT_COMMIT_DIFF_MAX_BYTES - Buffer.byteLength(suffix, 'utf8');
      let cut = raw;
      while (Buffer.byteLength(cut, 'utf8') > maxBody) {
        cut = cut.slice(0, Math.floor(cut.length * 0.92));
      }
      cut = cut + suffix;
      this.logger.log(
        `${colors.yellow}📎 [diff] patch truncado${colors.reset} repo=${repoFullName} sha=${sha.slice(0, 12)} origBytes=${bytes}`,
      );
      return { patch: cut, truncated: true };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof BadGatewayException) {
        throw err;
      }
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}❌ [diff] falha inesperada${colors.reset} repo=${repoFullName} err=${hint}`,
      );
      throw new BadGatewayException(`Falha ao calcular diff no Gitea: ${hint}`);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {
        /* ignore */
      });
    }
  }
}
