import { Global, Module } from '@nestjs/common';
import { IonosInfraService } from './ionos-infra.service';

@Global()
@Module({
  providers: [IonosInfraService],
  exports: [IonosInfraService],
})
export class IonosModule {}
