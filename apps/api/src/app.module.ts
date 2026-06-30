import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './database/prisma.module';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ClientsModule } from './modules/clients/clients.module';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { RecordsModule } from './modules/records/records.module';

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
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PatientsModule,
    ClientsModule,
    RequisitionsModule,
    RecordsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
