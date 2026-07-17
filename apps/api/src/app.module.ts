import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { LabContextMiddleware } from './common/tenancy/lab-context.middleware';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { ExecutionContextModule } from './common/execution-context/execution-context.module';
import { ExecutionContextMiddleware } from './common/execution-context/execution-context.middleware';
import { AuditModule } from './modules/audit/audit.module';
import { PrismaModule } from './database/prisma.module';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ClientsModule } from './modules/clients/clients.module';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { RequisitionPortalModule } from './modules/requisition-portal/requisition-portal.module';
import { RecordsModule } from './modules/records/records.module';
import { CabinetsModule } from './modules/cabinets/cabinets.module';
import { CodeSheetsModule } from './modules/code-sheets/code-sheets.module';
import { LabCodesModule } from './modules/lab-codes/lab-codes.module';
import { WorkforceModule } from './modules/workforce/workforce.module';
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
import { OperationsModule } from './modules/operations/operations.module';
import { SignoutModule } from './modules/signout/signout.module';
import { QcModule } from './modules/qc/qc.module';
import { BatchModule } from './modules/batch/batch.module';
import { ReqTrackingModule } from './modules/req-tracking/req-tracking.module';
import { CorrelationModule } from './modules/correlation/correlation.module';
import { ProficiencyModule } from './modules/proficiency/proficiency.module';
import { ReagentModule } from './modules/reagent/reagent.module';
import { RecallModule } from './modules/recall/recall.module';
import { WsiModule } from './modules/wsi/wsi.module';
import { AIScreeningModule } from './modules/ai-screening/ai-screening.module';
import { TeleconsultModule } from './modules/teleconsult/teleconsult.module';
import { CodingModule } from './modules/coding/coding.module';
import { FhirModule } from './modules/fhir/fhir.module';
import { ReportCenterModule } from './modules/report-center/report-center.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { LabModule } from './modules/lab/lab.module';
import { QualityGovernanceModule } from './modules/quality-governance/quality-governance.module';
import { EnterpriseAdministrationModule } from './modules/enterprise-administration/enterprise-administration.module';
import { DiagnosticCaseModule } from './modules/diagnostic-case/diagnostic-case.module';
import { EnterpriseCaseManagementModule } from './modules/enterprise-case-management/enterprise-case-management.module';
import { AncillaryOrdersModule } from './modules/ancillary-orders/ancillary-orders.module';
import { ScreeningBatchesModule } from './modules/screening-batches/screening-batches.module';

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
    // Structured logging (Pino). Pretty in dev, JSON in prod. Request auto-logging
    // is off to keep noise/behaviour close to the previous default logger; secrets
    // are redacted so nothing sensitive is ever written to logs.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        autoLogging: false,
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
          : undefined,
      },
    }),
    ScheduleModule.forRoot(),
    // Global default: 100 requests / minute / IP. Auth routes tighten this
    // per-handler via @Throttle (login/refresh: 5/min).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TenancyModule,
    ExecutionContextModule,
    AuditModule,
    PrismaModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PatientsModule,
    ClientsModule,
    RequisitionsModule,
    RequisitionPortalModule,
    RecordsModule,
    CabinetsModule,
    CodeSheetsModule,
    LabCodesModule,
    WorkforceModule,
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
    OperationsModule,
    SignoutModule,
    QcModule,
    BatchModule,
    ReqTrackingModule,
    CorrelationModule,
    ProficiencyModule,
    ReagentModule,
    RecallModule,
    WsiModule,
    AIScreeningModule,
    TeleconsultModule,
    CodingModule,
    FhirModule,
    ReportCenterModule,
    KnowledgeBaseModule,
    LabModule,
    QualityGovernanceModule,
    EnterpriseAdministrationModule,
    DiagnosticCaseModule,
    EnterpriseCaseManagementModule,
    AncillaryOrdersModule,
    ScreeningBatchesModule,
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
    // Open a tenant context for every request before guards/handlers run, then enrich it with
    // transport attribution (correlation/request ids, IP/UA). Order matters: the execution
    // context writes onto the store the tenancy middleware opens. Attribution only — no tenancy
    // or authorization behaviour changes.
    consumer
      .apply(LabContextMiddleware, ExecutionContextMiddleware)
      .forRoutes('*');
  }
}
