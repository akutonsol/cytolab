import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ClockEventType, ClockMethod } from '@prisma/client';

export class ClockDto {
  @IsString() employeeId!: string;
  @IsEnum(ClockEventType) type!: ClockEventType;
  @IsEnum(ClockMethod) @IsOptional() method?: ClockMethod;
  @IsString() @IsOptional() location?: string;
  @IsString() @IsOptional() notes?: string;
}

export class ClockHistoryQuery {
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
}

export class CorrectClockDto {
  @IsDateString() timestamp!: string;
  @IsString() reason!: string;
}

export class GenerateTimesheetDto {
  @IsString() employeeId!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}

export class RejectDto {
  @IsString() reason!: string;
}

export class TimesheetQuery {
  @IsString() @IsOptional() employeeId?: string;
  @IsString() @IsOptional() status?: string;
  @IsDateString() @IsOptional() periodStart?: string;
}

export class AssignShiftDto {
  @IsString() employeeId!: string;
  @IsString() shiftId!: string;
  @IsDateString() date!: string;
}

export class BulkAssignDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AssignShiftDto) assignments!: AssignShiftDto[];
}

export class ScheduleQuery {
  @IsDateString() weekStart!: string;
  @IsString() @IsOptional() departmentId?: string;
}

export class CreateShiftDto {
  @IsString() name!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsString() type!: string;
  @IsString() @IsOptional() color?: string;
}

export class UpdateShiftDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() startTime?: string;
  @IsString() @IsOptional() endTime?: string;
  @IsString() @IsOptional() type?: string;
  @IsString() @IsOptional() color?: string;
}

export class AttendanceSummaryQuery {
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
}
