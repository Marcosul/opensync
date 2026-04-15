import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WorkspaceInviteMailService } from './workspace-invite-mail.service';
import { WorkspaceInvitesPublicController } from './workspace-invites-public.controller';
import { WorkspaceInvitesService } from './workspace-invites.service';
import { WorkspaceInvitesWorkspaceController } from './workspace-invites-workspace.controller';

@Module({
  imports: [PrismaModule, WorkspacesModule],
  controllers: [WorkspaceInvitesWorkspaceController, WorkspaceInvitesPublicController],
  providers: [WorkspaceInvitesService, WorkspaceInviteMailService],
  exports: [WorkspaceInvitesService],
})
export class WorkspaceInvitesModule {}
