import { Module } from '@nestjs/common';
import { ValidationService } from './validation.service';
import { ValidationController } from './validation.controller';
import { VALIDATION_VALIDATOR } from './validation-tokens';
import { StubValidationValidator } from './validation-validator';

/**
 * Program 6 · Phase 6F — validation evidence. Parallel to 6A–6E (all untouched) and SEPARATE from model lifecycle +
 * the clinical path. PrismaService + AuditRecorder come from their @Global modules. The validator is a pluggable
 * provider; only the deterministic non-clinical stub ships in 6F. Manual, human-initiated runs only — no worker, no
 * scheduler, no automation. No support lifecycle promotion; no support inference/clinical authorization.
 */
@Module({
  controllers: [ValidationController],
  providers: [
    ValidationService,
    { provide: VALIDATION_VALIDATOR, useClass: StubValidationValidator },
  ],
  exports: [ValidationService],
})
export class ValidationModule {}
