import {
  IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Leave ────────────────────────────────────────────────────────────────────
export class CreateLeaveTypeDto {
  @IsString() name!: string;
  @IsInt() @Min(0) maxDaysPerYear!: number;
  @IsBoolean() @IsOptional() requiresApproval?: boolean;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class CreateLeaveRequestDto {
  @IsString() employeeId!: string;
  @IsString() leaveTypeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsString() @IsOptional() reason?: string;
}

export class LeaveRequestQuery {
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() employeeId?: string;
  @IsDateString() @IsOptional() startDate?: string;
  @IsDateString() @IsOptional() endDate?: string;
}

export class RejectLeaveDto {
  @IsString() rejectionReason!: string;
}

export class TypeEntitlementDto {
  @IsString() leaveTypeId!: string;
  @IsInt() @Min(0) entitlement!: number;
}

export class InitializeBalancesDto {
  @IsInt() year!: number;
  @IsArray() @IsOptional() @IsString({ each: true }) employeeIds?: string[];
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => TypeEntitlementDto)
  typeEntitlements?: TypeEntitlementDto[];
}

// ── Overtime ─────────────────────────────────────────────────────────────────
export class CreateOvertimeRuleDto {
  @IsString() name!: string;
  @IsInt() @Min(0) @IsOptional() dailyThresholdMinutes?: number;
  @IsInt() @Min(0) @IsOptional() weeklyThresholdMinutes?: number;
  @IsInt() @Min(1) @IsOptional() rateMultiplierX100?: number;
  @IsBoolean() @IsOptional() requiresApproval?: boolean;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class OvertimeRecordQuery {
  @IsString() @IsOptional() employeeId?: string;
  @IsDateString() @IsOptional() startDate?: string;
  @IsDateString() @IsOptional() endDate?: string;
  @IsString() @IsOptional() status?: string;
}

export class CalculateOvertimeDto {
  @IsString() employeeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}

export class RejectOvertimeDto {
  @IsString() @IsOptional() reason?: string;
}

// ── Reports ──────────────────────────────────────────────────────────────────
export class AttendanceReportQuery {
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsString() @IsOptional() departmentId?: string;
}

export class DateRangeReportQuery {
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}
