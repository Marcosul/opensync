import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SyncModule } from '../sync/sync.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';

@Module({
  imports: [SyncModule, WorkspacesModule, ThrottlerModule],
  controllers: [VaultsController],
  providers: [VaultsService],
})
export class VaultsModule {}
