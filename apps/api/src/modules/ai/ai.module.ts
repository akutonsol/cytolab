import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

/**
 * F4 AI-assisted reporting core (steps 1–2): the Anthropic wrapper + redaction
 * assembler + prompts. Endpoints/orchestration (steps 3–6) land later and will
 * import this module.
 */
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
