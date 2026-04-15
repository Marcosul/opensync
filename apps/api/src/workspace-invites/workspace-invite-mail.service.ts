import { Injectable, Logger } from '@nestjs/common';

const colors = {
  reset: '\x1b[0m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Envio de e-mail de convite: por agora log colorido + link; pode evoluir para Resend/SMTP.
 */
@Injectable()
export class WorkspaceInviteMailService {
  private readonly logger = new Logger(WorkspaceInviteMailService.name);

  sendWorkspaceInviteLink(params: {
    toEmail: string;
    workspaceName: string;
    inviteUrl: string;
  }): void {
    this.logger.log(
      `${colors.magenta}📧 Convite de workspace (simular envio):${colors.reset} ` +
        `${colors.cyan}para=${params.toEmail} workspace=${params.workspaceName}${colors.reset}`,
    );
    this.logger.log(
      `${colors.magenta}🔗 Link do convite:${colors.reset} ${colors.cyan}${params.inviteUrl}${colors.reset}`,
    );
  }
}
