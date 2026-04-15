import { Module } from '@nestjs/common';
import { CollabYjsService } from './collab-yjs.service';

@Module({
  providers: [CollabYjsService],
})
export class CollabModule {}
