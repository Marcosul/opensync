import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { VaultsModule } from '../vaults/vaults.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [PrismaModule, VaultsModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
