import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { FormConfigController } from './form-config.controller';
import { FormConfigService } from './form-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [FormConfigController],
  providers: [FormConfigService],
  exports: [FormConfigService],
})
export class FormConfigModule {}
