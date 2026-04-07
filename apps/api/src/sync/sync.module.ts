import { Module } from '@nestjs/common';
import { GiteaService } from './gitea.service';
import { SyncController } from './sync.controller';

@Module({
  controllers: [SyncController],
  providers: [GiteaService],
  exports: [GiteaService],
})
export class SyncModule {}
