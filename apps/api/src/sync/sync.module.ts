import { Module } from '@nestjs/common';
import { GiteaService } from './gitea.service';
import { VaultGitSyncService } from './vault-git-sync.service';

@Module({
  providers: [GiteaService, VaultGitSyncService],
  exports: [GiteaService, VaultGitSyncService],
})
export class SyncModule {}
