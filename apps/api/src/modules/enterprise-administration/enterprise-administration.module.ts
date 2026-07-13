import { Module } from '@nestjs/common';
import { LabModule } from '../lab/lab.module';
import { DepartmentsModule } from '../departments/departments.module';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { ClientsModule } from '../clients/clients.module';
import { LabCodesModule } from '../lab-codes/lab-codes.module';
import { CodeSheetsModule } from '../code-sheets/code-sheets.module';
import { RecordsModule } from '../records/records.module';
import { FhirModule } from '../fhir/fhir.module';
import { BillingModule } from '../billing/billing.module';
import { ServicesCatalogModule } from '../services-catalog/services-catalog.module';
import { TaxesModule } from '../taxes/taxes.module';
import { LabFeaturesModule } from '../lab-features/lab-features.module';
import { SystemModule } from '../system/system-health.module';
import { AiModule } from '../ai/ai.module';
import { PortalModule } from '../portal/portal.module';
import { EnterpriseAdministrationController } from './enterprise-administration.controller';
import { EnterpriseAdministrationService } from './enterprise-administration.service';

// Thin orchestration module for the Enterprise Administration & Controls Workspace. It owns no
// persistence and holds no Prisma. A3 imports the owner modules whose recorded configuration the
// Laboratory/Branding/Departments sections read (each owner module exports its service). Later
// checkpoints add more owner-module imports as each section lands.
@Module({
  imports: [
    LabModule, DepartmentsModule, UsersModule, RolesModule, SecurityModule, ClientsModule, LabCodesModule,
    CodeSheetsModule, RecordsModule, FhirModule, BillingModule, ServicesCatalogModule, TaxesModule,
    LabFeaturesModule, SystemModule, AiModule, PortalModule,
  ],
  controllers: [EnterpriseAdministrationController],
  providers: [EnterpriseAdministrationService],
})
export class EnterpriseAdministrationModule {}
