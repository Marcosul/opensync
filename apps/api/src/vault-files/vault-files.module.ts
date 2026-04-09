import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { SyncModule } from '../sync/sync.module';
import { AgentVaultController } from './agent-vault.controller';
import { VaultFilesService } from './vault-files.service';
import { VaultGiteaMirrorService } from './vault-gitea-mirror.service';

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [AgentVaultController],
  providers: [VaultFilesService, VaultGiteaMirrorService],
  exports: [VaultFilesService],
})
export class VaultFilesModule {}
