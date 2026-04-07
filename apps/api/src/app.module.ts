import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { IonosModule } from './ionos/ionos.module';
import { AuthModule } from './auth/auth.module';
import { VaultsModule } from './vaults/vaults.module';
import { SyncModule } from './sync/sync.module';
import { CommitsModule } from './commits/commits.module';
import { GraphModule } from './graph/graph.module';
import { PlansModule } from './plans/plans.module';
import { BillingModule } from './billing/billing.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    IonosModule,
    AuthModule,
    VaultsModule,
    SyncModule,
    CommitsModule,
    GraphModule,
    PlansModule,
    BillingModule,
  ],
})
export class AppModule {}
