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
  private readonly defaultOrg = (process.env.GITEA_DEFAULT_ORG ?? 'opensync')
    .trim()
    .toLowerCase();

  private ensureConfigured() {
    if (!this.baseUrl || !this.token) {
      this.logger.error(
        `${colors.red}❌ Gitea não configurado (GITEA_URL/GITEA_ADMIN_TOKEN)${colors.reset}`,
      );
      throw new InternalServerErrorException('Gitea não configurado no servidor');
    }
  }

  private get headers(): HeadersInit {
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
    const response = await fetch(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      const text = await response.text();
      throw new BadGatewayException(`Gitea HTTP ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  private async ensureOrgExists(org: string): Promise<void> {
    this.ensureConfigured();
    const check = await fetch(`${this.baseUrl}/api/v1/orgs/${org}`, {
      headers: this.headers,
    });
    if (check.ok) return;
    if (check.status !== 404) {
      const body = await check.text();
      throw new BadGatewayException(`Falha ao consultar org ${org}: ${body}`);
    }

    this.logger.log(
      `${colors.cyan}🏗️ Criando organização no Gitea:${colors.reset} ${org}`,
    );
    await this.fetchJson('/api/v1/orgs', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        username: org,
        full_name: `OpenSync ${org}`,
        visibility: 'private',
      }),
    });
  }

  async createRepoForVault(userId: string, vaultName: string): Promise<string> {
    this.ensureConfigured();
    const org = this.defaultOrg;
    const repoName = `${this.slugify(vaultName)}-${userId.slice(0, 8)}`;
    await this.ensureOrgExists(org);

    const path = `/api/v1/orgs/${encodeURIComponent(org)}/repos`;
    const create = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        name: repoName,
        private: true,
        auto_init: true,
      }),
    });

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

  async deleteRepo(repoFullName: string): Promise<void> {
    this.ensureConfigured();
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) return;
    const response = await fetch(
      `${this.baseUrl}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { method: 'DELETE', headers: this.headers },
    );
    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      this.logger.error(
        `${colors.red}❌ Falha ao deletar repo de compensação:${colors.reset} ${repoFullName} ${body}`,
      );
    }
  }
}
