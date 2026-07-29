import { Module } from '@nestjs/common';
import { AiRegistryService } from './ai-registry.service';
import { AiRegistryController } from './ai-registry.controller';

/**
 * Program 6 · Phase 6A — AI model registry + lifecycle governance. A PARALLEL subsystem to the existing
 * text-reporting AI path (`modules/ai`, untouched). PrismaService + AuditRecorder come from their @Global
 * modules. No worker/scheduler/queue and no runtime model call in 6A.
 */
@Module({
  controllers: [AiRegistryController],
  providers: [AiRegistryService],
  exports: [AiRegistryService],
})
export class AiRegistryModule {}
