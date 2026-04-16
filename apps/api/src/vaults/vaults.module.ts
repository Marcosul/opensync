import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SyncModule } from '../sync/sync.module';
import { VaultFilesModule } from '../vault-files/vault-files.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { PublicVaultsController } from './public-vaults.controller';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';
import { GraphService } from './graph.service';

@Module({
  imports: [SyncModule, VaultFilesModule, WorkspacesModule, ThrottlerModule],
  controllers: [VaultsController, PublicVaultsController],
  providers: [VaultsService, GraphService],
  exports: [VaultsService],
})
export class VaultsModule {}
