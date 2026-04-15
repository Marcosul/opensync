import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { IonosModule } from './ionos/ionos.module';
import { AuthModule } from './auth/auth.module';
import { VaultsModule } from './vaults/vaults.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { SyncModule } from './sync/sync.module';
import { CommitsModule } from './commits/commits.module';
import { GraphModule } from './graph/graph.module';
import { PlansModule } from './plans/plans.module';
import { BillingModule } from './billing/billing.module';
import { UserAccessKeysModule } from './user-access-keys/user-access-keys.module';
import { UserModule } from './user/user.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './common/prisma.module';
import { CollabModule } from './collab/collab.module';
import { WorkspaceMembersModule } from './workspace-members/workspace-members.module';
import { WorkspaceInvitesModule } from './workspace-invites/workspace-invites.module';

@Module({
  controllers: [HealthController],
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    IonosModule,
    AuthModule,
    VaultsModule,
    WorkspacesModule,
    SyncModule,
    CommitsModule,
    GraphModule,
    PlansModule,
    BillingModule,
    UserAccessKeysModule,
    UserModule,
    CollabModule,
    WorkspaceMembersModule,
    WorkspaceInvitesModule,
  ],
})
export class AppModule {}
