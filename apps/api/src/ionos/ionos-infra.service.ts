import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

/**
 * Reads IONOS VPS metadata from env (see .env.example).
 * REST calls to api.ionos.com require separate API credentials (not implemented here).
 */
@Injectable()
export class IonosInfraService implements OnModuleInit {
  private readonly logger = new Logger(IonosInfraService.name);

  readonly apiBaseUrl: string;
  readonly datacenterId: string | undefined;
  readonly serverId: string | undefined;
  readonly serverHref: string | undefined;
  readonly vpsIpv4: string | undefined;
  readonly sshUser: string;
  readonly sshPassword: string | undefined;

  constructor() {
    this.apiBaseUrl =
      process.env.IONOS_API_BASE_URL?.trim() ||
      'https://api.ionos.com/cloudapi/v6';
    this.datacenterId = process.env.IONOS_DATACENTER_ID?.trim() || undefined;
    this.serverId = process.env.IONOS_SERVER_ID?.trim() || undefined;
    this.serverHref = process.env.IONOS_SERVER_HREF?.trim() || undefined;
    this.vpsIpv4 = process.env.IONOS_VPS_IPV4?.trim() || undefined;
    this.sshUser = process.env.IONOS_VPS_SSH_USER?.trim() || 'root';
    this.sshPassword = process.env.IONOS_VPS_SSH_PASSWORD?.trim() || undefined;
  }

  onModuleInit(): void {
    if (!this.isConfigured()) {
      const partial =
        this.datacenterId || this.serverId || this.vpsIpv4 || this.serverHref;
      if (partial) {
        this.logger.warn(
          `${colors.yellow}☁️  IONOS: env incompleta (defina IONOS_DATACENTER_ID e IONOS_SERVER_ID)${colors.reset}`,
        );
      }
      return;
    }
    const host = this.vpsIpv4 ?? '(sem IONOS_VPS_IPV4)';
    this.logger.log(
      `${colors.green}☁️  IONOS VPS registrada${colors.reset} ${colors.cyan}${host}${colors.reset} ${colors.dim}dc=${this.datacenterId} server=${this.serverId}${colors.reset}`,
    );
  }

  isConfigured(): boolean {
    return Boolean(this.datacenterId && this.serverId);
  }

  /** Full Cloud API path for this server (v6). */
  getServerApiUrl(): string {
    if (!this.isConfigured()) {
      throw new Error('IONOS_DATACENTER_ID and IONOS_SERVER_ID must be set');
    }
    return `${this.apiBaseUrl.replace(/\/$/, '')}/datacenters/${this.datacenterId}/servers/${this.serverId}`;
  }

  /** SSH target for scripts / future automation (never log password). */
  getSshTarget(): { host: string; user: string; password?: string } | null {
    if (!this.vpsIpv4) return null;
    return {
      host: this.vpsIpv4,
      user: this.sshUser,
      password: this.sshPassword,
    };
  }
}
