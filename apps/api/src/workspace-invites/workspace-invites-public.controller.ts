import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { WorkspaceInvitesService } from './workspace-invites.service';

@Controller('workspace-invites')
export class WorkspaceInvitesPublicController {
  constructor(private readonly invitesService: WorkspaceInvitesService) {}

  private requireUserId(userId: string | undefined): string {
    const normalized = userId?.trim();
    if (!normalized) {
      throw new UnauthorizedException('Usuário ausente (x-opensync-user-id)');
    }
    return normalized;
  }

  @Get('pending')
  async pending(@Headers('x-opensync-user-id') userId: string | undefined) {
    const uid = this.requireUserId(userId);
    const invites = await this.invitesService.listPendingForUser(uid);
    return { invites };
  }

  @Get(':token')
  async getByToken(@Param('token') token: string) {
    const invite = await this.invitesService.getInviteByToken(token.trim());
    return { invite };
  }

  @Post('accept')
  async accept(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Headers('x-opensync-user-email') userEmail: string | undefined,
    @Body() body: AcceptInviteDto,
  ) {
    const uid = this.requireUserId(userId);
    if (body.inviteId?.trim()) {
      return this.invitesService.acceptInviteById(uid, userEmail, body.inviteId.trim());
    }
    if (body.token?.trim()) {
      return this.invitesService.acceptInvite(uid, userEmail, body.token.trim());
    }
    throw new BadRequestException('Envie token ou inviteId no corpo');
  }
}
