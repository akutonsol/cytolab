import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LabContextMiddleware } from './common/tenancy/lab-context.middleware';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { PrismaModule } from './database/prisma.module';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ClientsModule } from './modules/clients/clients.module';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { RecordsModule } from './modules/records/records.module';
import { CabinetsModule } from './modules/cabinets/cabinets.module';
import { CodeSheetsModule } from './modules/code-sheets/code-sheets.module';
import { LabCodesModule } from './modules/lab-codes/lab-codes.module';
import { ResultSheetsModule } from './modules/result-sheets/result-sheets.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ServicesCatalogModule } from './modules/services-catalog/services-catalog.module';
import { TaxesModule } from './modules/taxes/taxes.module';
import { BillingModule } from './modules/billing/billing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PortalModule } from './modules/portal/portal.module';
import { ChangeRequestsModule } from './modules/change-requests/change-requests.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { SystemModule } from './modules/system/system-health.module';
import { FormConfigModule } from './modules/form-config/form-config.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SearchModule } from './modules/search/search.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { FilesModule } from './modules/files/files.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ResultTemplatesModule } from './modules/result-templates/result-templates.module';
import { BethesdaModule } from './modules/bethesda/bethesda.module';
import { TatModule } from './modules/tat/tat.module';
import { LabFeaturesModule } from './modules/lab-features/lab-features.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { WorkloadModule } from './modules/workload/workload.module';
import { QcModule } from './modules/qc/qc.module';
import { BatchModule } from './modules/batch/batch.module';
import { ReqTrackingModule } from './modules/req-tracking/req-tracking.module';

/**
 * Cytolab modular monolith.
 *
 * Domain modules are added here as they are built (Phase plan in /docs/REBUILD_PLAN.md):
 *   Phase 1: AuthModule, UsersModule, RolesModule, WorkspacesModule
 *   Phase 2: PatientsModule, ClientsModule, RequisitionsModule, SpecimensModule
 *   Phase 3: ResultSheetsModule, CodeSheetsModule, LabCodesModule, CabinetsModule, ReportsModule
 *   Phase 4: BillingModule, PaymentsModule, ServicesCatalogModule, TaxesModule
 *   Phase 5: EmployeesModule, DepartmentsModule, PayrollModule
 *   Phase 6: MessagingModule, NotificationsModule, AppointmentsModule, SearchModule, SettingsModule, FilesModule
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TenancyModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PatientsModule,
    ClientsModule,
    RequisitionsModule,
    RecordsModule,
    CabinetsModule,
    CodeSheetsModule,
    LabCodesModule,
    ResultSheetsModule,
    ReportsModule,
    AiModule,
    AnalyticsModule,
    ServicesCatalogModule,
    TaxesModule,
    BillingModule,
    PaymentsModule,
    PortalModule,
    ChangeRequestsModule,
    MessagingModule,
    AppointmentsModule,
    SystemModule,
    FormConfigModule,
    NotificationsModule,
    SearchModule,
    WorkspacesModule,
    FilesModule,
    DepartmentsModule,
    EmployeesModule,
    PayrollModule,
    ResultTemplatesModule,
    BethesdaModule,
    TatModule,
    LabFeaturesModule,
    EscalationModule,
    WorkloadModule,
    QcModule,
    BatchModule,
    ReqTrackingModule,
  ],
  controllers: [HealthController],
  providers: [
    // Activate the configured rate limits globally (portal routes tighten
    // them further via @Throttle).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Open a tenant context for every request before guards/handlers run.
    consumer.apply(LabContextMiddleware).forRoutes('*');
  }
}
