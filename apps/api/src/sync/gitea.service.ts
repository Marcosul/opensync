import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

type GiteaRepo = {
  owner?: { login?: string };
  name?: string;
  full_name?: string;
};

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

@Injectable()
export class GiteaService {
  private readonly logger = new Logger(GiteaService.name);
  private readonly baseUrl = (process.env.GITEA_URL ?? '').replace(/\/+$/, '');
  private readonly token = process.env.GITEA_ADMIN_TOKEN ?? '';

  private ensureConfigured() {
    if (!this.baseUrl || !this.token) {
      this.logger.error(
        `${colors.red}❌ Gitea não configurado (GITEA_URL/GITEA_ADMIN_TOKEN)${colors.reset}`,
      );
      throw new InternalServerErrorException('Gitea não configurado no servidor');
    }
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `token ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private slugify(input: string): string {
    const s = input
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    return s || 'vault';
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}🌐 Gitea rede/indisponivel:${colors.reset} ${hint}`,
      );
      throw new BadGatewayException(
        `Nao foi possivel contatar o Gitea (${this.baseUrl}). Verifique GITEA_URL e rede: ${hint}`,
      );
    }
    if (!response.ok) {
      const text = await response.text();
      throw new BadGatewayException(`Gitea HTTP ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  /**
   * Cria a organização no Gitea (uma por workspace). Exige PAT com write:organization (+ repo).
   */
  async ensureOrg(opts: { username: string; fullName: string }): Promise<void> {
    this.ensureConfigured();
    const username = opts.username.trim().toLowerCase();
    const fullName = opts.fullName.trim().slice(0, 100) || username;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/v1/orgs`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          username,
          full_name: fullName,
          visibility: 'private',
        }),
      });
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}🌐 Gitea (criar org):${colors.reset} ${hint}`,
      );
      throw new BadGatewayException(
        `Nao foi possivel contatar o Gitea: ${hint}`,
      );
    }

    if (res.ok) {
      this.logger.log(
        `${colors.cyan}🏗️ Org Gitea criada:${colors.reset} ${username}`,
      );
      return;
    }

    const body = await res.text();
    if (res.status === 422 || res.status === 409) {
      return;
    }
    if (res.status === 400 && /already exists|exist|duplicate|taken/i.test(body)) {
      return;
    }
    if (res.status === 403) {
      throw new BadGatewayException(
        `Gitea recusou criar a org "${username}". O GITEA_ADMIN_TOKEN precisa do scope ` +
          `write:organization e permisso para criar repositorios (ex.: write:repository em todos os repos, ` +
          `ou token de administrador). Veja docs/dev/gitea-ionos-first-install.md. Resposta: ${body}`,
      );
    }
    throw new BadGatewayException(`Falha ao criar org Gitea "${username}": ${body}`);
  }

  async createRepoForVault(
    vaultName: string,
    giteaOrg: string,
    workspaceId: string,
  ): Promise<string> {
    this.ensureConfigured();
    const org = giteaOrg.trim().toLowerCase();
    const wsFrag = workspaceId.replace(/-/g, '').slice(0, 12);
    const repoName = `${this.slugify(vaultName)}-${wsFrag}`;
    this.logger.log(
      `${colors.cyan}📦 Criando repo na org do workspace:${colors.reset} ${org}/${repoName}`,
    );

    const path = `/api/v1/orgs/${encodeURIComponent(org)}/repos`;
    let create: Response;
    try {
      create = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          name: repoName,
          private: true,
          auto_init: true,
        }),
      });
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}🌐 Gitea (criar repo):${colors.reset} ${hint}`,
      );
      throw new BadGatewayException(
        `Nao foi possivel criar repo no Gitea: ${hint}`,
      );
    }

    if (create.ok) {
      const repo = (await create.json()) as GiteaRepo;
      const full = repo.full_name ?? `${org}/${repoName}`;
      this.logger.log(
        `${colors.green}✅ Repo criado no Gitea:${colors.reset} ${full}`,
      );
      return full;
    }

    if (create.status === 409) {
      this.logger.warn(
        `${colors.yellow}⚠️ Repo já existe, reutilizando:${colors.reset} ${org}/${repoName}`,
      );
      return `${org}/${repoName}`;
    }

    const body = await create.text();
    this.logger.error(
      `${colors.red}❌ Erro ao criar repo no Gitea:${colors.reset} ${body}`,
    );
    throw new BadGatewayException(`Falha ao criar repo no Gitea: ${body}`);
  }

  /**
   * URL de clone HTTP(S) com token para uso em `simple-git` (oauth2 + token no password).
   */
  buildAuthenticatedCloneUrl(repoFullName: string): string {
    this.ensureConfigured();
    const [owner, repo] = repoFullName.split('/').map((s) => s.trim());
    if (!owner || !repo) {
      throw new InternalServerErrorException('giteaRepo invalido (esperado owner/repo)');
    }
    const base = this.baseUrl.includes('://')
      ? this.baseUrl
      : `http://${this.baseUrl}`;
    let u: URL;
    try {
      u = new URL(base);
    } catch {
      throw new InternalServerErrorException('GITEA_URL invalido');
    }
    const user = 'oauth2';
    const pass = encodeURIComponent(this.token);
    const pathPrefix = u.pathname.replace(/\/$/, '');
    return `${u.protocol}//${user}:${pass}@${u.host}${pathPrefix}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git`;
  }

  /**
   * Remove o repositório no Gitea. 404 = já removido (sucesso).
   * Lança BadGatewayException se o Gitea responder erro (exceto 404).
   */
  private parseOwnerRepo(repoFullName: string): { owner: string; repo: string } {
    const t = repoFullName.trim();
    const i = t.indexOf('/');
    if (i <= 0 || i === t.length - 1) {
      throw new InternalServerErrorException(
        'giteaRepo invalido (esperado owner/repo)',
      );
    }
    return { owner: t.slice(0, i), repo: t.slice(i + 1) };
  }

  /**
   * URL SSH publica para clone/push com deploy key (sem credenciais embutidas).
   * GITEA_SSH_HOST sobrescreve o hostname derivado de GITEA_URL.
   */
  buildSshCloneUrl(repoFullName: string): string {
    this.ensureConfigured();
    const { owner, repo } = this.parseOwnerRepo(repoFullName);
    const sshHost =
      (process.env.GITEA_SSH_HOST ?? '').trim() ||
      this.sshHostFromGiteaUrl();
    return `git@${sshHost}:${owner}/${repo}.git`;
  }

  private sshHostFromGiteaUrl(): string {
    let base = (process.env.GITEA_URL ?? '').replace(/\/+$/, '');
    if (!base) return 'localhost';
    if (!base.includes('://')) base = `https://${base}`;
    try {
      return new URL(base).hostname;
    } catch {
      return 'localhost';
    }
  }

  async addDeployKey(
    repoFullName: string,
    opts: { title: string; key: string; readOnly: boolean },
  ): Promise<{ id: number; fingerprint?: string; key: string }> {
    this.ensureConfigured();
    const { owner, repo } = this.parseOwnerRepo(repoFullName);
    const path = `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/keys`;
    return this.fetchJson<{ id: number; fingerprint?: string; key: string }>(path, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        title: opts.title.slice(0, 120),
        key: opts.key.trim(),
        read_only: opts.readOnly,
      }),
    });
  }

  async deleteDeployKey(repoFullName: string, keyId: number): Promise<void> {
    this.ensureConfigured();
    const { owner, repo } = this.parseOwnerRepo(repoFullName);
    const path = `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/keys/${keyId}`;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: this.headers,
      });
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}🌐 Gitea (apagar deploy key):${colors.reset} ${hint}`,
      );
      throw new BadGatewayException(
        `Nao foi possivel contatar o Gitea: ${hint}`,
      );
    }
    if (response.ok || response.status === 404) {
      return;
    }
    const body = await response.text();
    throw new BadGatewayException(
      `Falha ao apagar deploy key (HTTP ${response.status}): ${body}`,
    );
  }

  async deleteRepo(repoFullName: string): Promise<void> {
    this.ensureConfigured();
    const trimmed = repoFullName.trim();
    const slash = trimmed.indexOf('/');
    if (slash < 0 || slash === trimmed.length - 1) {
      this.logger.warn(
        `${colors.yellow}⚠️ deleteRepo: full_name invalido, ignorando:${colors.reset} ${repoFullName}`,
      );
      return;
    }
    const owner = trimmed.slice(0, slash);
    const repo = trimmed.slice(slash + 1);
    if (!owner || !repo) return;

    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        { method: 'DELETE', headers: this.headers },
      );
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `${colors.red}🌐 Gitea (apagar repo):${colors.reset} ${hint}`,
      );
      throw new BadGatewayException(
        `Nao foi possivel apagar o repo no Gitea: ${hint}`,
      );
    }

    if (response.ok || response.status === 404) {
      this.logger.log(
        `${colors.green}🗑️ Repo Gitea removido ou inexistente:${colors.reset} ${trimmed}`,
      );
      return;
    }

    const body = await response.text();
    this.logger.error(
      `${colors.red}❌ Falha ao apagar repo no Gitea:${colors.reset} ${trimmed} HTTP ${response.status} ${body}`,
    );
    throw new BadGatewayException(
      `Falha ao apagar repo no Gitea (HTTP ${response.status}): ${body}`,
    );
  }
}
