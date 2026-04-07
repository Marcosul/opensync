import { Module } from '@nestjs/common';
import { GiteaService } from './gitea.service';
import { SyncController } from './sync.controller';
import { VaultGitSyncService } from './vault-git-sync.service';

@Module({
  controllers: [SyncController],
  providers: [GiteaService, VaultGitSyncService],
  exports: [GiteaService, VaultGitSyncService],
})
export class SyncModule {}
