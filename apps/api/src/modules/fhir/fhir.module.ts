import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { FhirController } from './fhir.controller';
import { FhirService } from './fhir.service';
import { FhirBuilderService } from './fhir-builder.service';

@Module({
  imports: [PrismaModule],
  controllers: [FhirController],
  providers: [FhirService, FhirBuilderService],
  exports: [FhirService],
})
export class FhirModule {}
