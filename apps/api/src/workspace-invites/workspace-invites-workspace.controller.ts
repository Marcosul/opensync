import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateWorkspaceInviteDto } from './dto/create-workspace-invite.dto';
import { WorkspaceInvitesService } from './workspace-invites.service';

@Controller('workspaces/:workspaceId/invites')
export class WorkspaceInvitesWorkspaceController {
  constructor(private readonly invitesService: WorkspaceInvitesService) {}

  private requireUserId(userId: string | undefined): string {
    const normalized = userId?.trim();
    if (!normalized) {
      throw new UnauthorizedException('Usuário ausente (x-opensync-user-id)');
    }
    return normalized;
  }

  @Get()
  async list(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Param('workspaceId') workspaceId: string,
  ) {
    const uid = this.requireUserId(userId);
    const invites = await this.invitesService.listForWorkspace(uid, workspaceId.trim());
    return { invites };
  }

  @Post()
  async create(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateWorkspaceInviteDto,
  ) {
    const uid = this.requireUserId(userId);
    return this.invitesService.createInvite(uid, workspaceId.trim(), body);
  }

  @Delete(':inviteId')
  async cancel(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Param('workspaceId') workspaceId: string,
    @Param('inviteId') inviteId: string,
  ) {
    const uid = this.requireUserId(userId);
    return this.invitesService.cancelInvite(uid, workspaceId.trim(), inviteId.trim());
  }

  @Post(':inviteId/resend')
  async resend(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Param('workspaceId') workspaceId: string,
    @Param('inviteId') inviteId: string,
  ) {
    const uid = this.requireUserId(userId);
    return this.invitesService.resendInvite(uid, workspaceId.trim(), inviteId.trim());
  }
}
