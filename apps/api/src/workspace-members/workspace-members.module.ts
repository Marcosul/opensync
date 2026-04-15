import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WorkspaceMembersController } from './workspace-members.controller';
import { WorkspaceMembersService } from './workspace-members.service';

@Module({
  imports: [PrismaModule, WorkspacesModule],
  controllers: [WorkspaceMembersController],
  providers: [WorkspaceMembersService],
  exports: [WorkspaceMembersService],
})
export class WorkspaceMembersModule {}
