import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { WsiModule } from '../wsi/wsi.module';
import { SignoutController } from './signout.controller';
import { SignoutService } from './signout.service';

// Thin orchestration module: composes existing services (RecordsModule and WsiModule
// export their services) around one case. Owns no domain logic and no persistence.
@Module({
  imports: [RecordsModule, WsiModule],
  controllers: [SignoutController],
  providers: [SignoutService],
})
export class SignoutModule {}
