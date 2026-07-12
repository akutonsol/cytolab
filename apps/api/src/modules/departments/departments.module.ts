import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

@Module({
  imports: [PrismaModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  // Read-only composition by the Enterprise Administration workspace (Departments section).
  // Enforcement authority stays with the departments controller (department:view/*).
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
