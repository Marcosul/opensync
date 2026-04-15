import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceAccessService],
  exports: [WorkspacesService, WorkspaceAccessService],
})
export class WorkspacesModule {}
