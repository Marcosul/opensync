import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { UserAccessKeysController } from './user-access-keys.controller';
import { UserAccessKeysService } from './user-access-keys.service';

@Module({
  imports: [PrismaModule],
  controllers: [UserAccessKeysController],
  providers: [UserAccessKeysService],
  exports: [UserAccessKeysService],
})
export class UserAccessKeysModule {}
