import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { IdentityLifecycleModule } from '../identity-lifecycle/identity-lifecycle.module';

// Program 7 · Phase 7B.1 (L8) — UsersService delegates the setActive state mutation to the single lifecycle command
// boundary (IdentityLifecycleService), so UsersModule imports IdentityLifecycleModule.
@Module({
  imports: [IdentityLifecycleModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
