import {
  IsDateString, IsInt, IsObject, IsOptional, IsString, Max, Min,
} from 'class-validator';

// ── Payroll ──────────────────────────────────────────────────────────────────
export class CreatePayrollPeriodDto {
  @IsInt() @Min(1) @Max(12) month!: number;
  @IsInt() @Min(2000) year!: number;
}

// ── Productivity ─────────────────────────────────────────────────────────────
export class UpsertProductivityMetricDto {
  @IsString() employeeId!: string;
  @IsDateString() date!: string;
  @IsInt() @Min(0) @IsOptional() specimensProcessed?: number;
  @IsInt() @Min(0) @IsOptional() reportsCompleted?: number;
  @IsInt() @Min(0) @IsOptional() averageTATMinutes?: number;
  @IsInt() @Min(0) @Max(100) @IsOptional() qualityScore?: number;
}

export class ProductivityMetricQuery {
  @IsString() @IsOptional() employeeId?: string;
  @IsDateString() @IsOptional() startDate?: string;
  @IsDateString() @IsOptional() endDate?: string;
}

export class ProductivitySummaryQuery {
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsString() @IsOptional() departmentId?: string;
}

export class BenchmarksQuery {
  @IsDateString() @IsOptional() startDate?: string;
  @IsDateString() @IsOptional() endDate?: string;
}

// ── Performance ──────────────────────────────────────────────────────────────
export class CreateReviewDto {
  @IsString() employeeId!: string;
  @IsString() period!: string;
  @IsInt() @Min(0) @Max(100) @IsOptional() overallScore?: number;
  @IsInt() @Min(0) @Max(100) @IsOptional() attendanceScore?: number;
  @IsInt() @Min(0) @Max(100) @IsOptional() productivityScore?: number;
  @IsInt() @Min(0) @Max(100) @IsOptional() qualityScore?: number;
  @IsString() @IsOptional() comments?: string;
  @IsObject() @IsOptional() goals?: Record<string, unknown>;
}

export class ReviewQuery {
  @IsString() @IsOptional() employeeId?: string;
  @IsString() @IsOptional() period?: string;
  @IsString() @IsOptional() status?: string;
}

export class UpdateReviewDto {
  @IsInt() @Min(0) @Max(100) @IsOptional() overallScore?: number;
  @IsInt() @Min(0) @Max(100) @IsOptional() attendanceScore?: number;
  @IsInt() @Min(0) @Max(100) @IsOptional() productivityScore?: number;
  @IsInt() @Min(0) @Max(100) @IsOptional() qualityScore?: number;
  @IsString() @IsOptional() comments?: string;
  @IsObject() @IsOptional() goals?: Record<string, unknown>;
}

export class CreateGoalDto {
  @IsString() employeeId!: string;
  @IsString() title!: string;
  @IsString() @IsOptional() description?: string;
  @IsDateString() targetDate!: string;
  @IsInt() @Min(0) @Max(100) @IsOptional() progress?: number;
}

export class GoalQuery {
  @IsString() @IsOptional() employeeId?: string;
  @IsString() @IsOptional() status?: string;
}

export class UpdateGoalDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsDateString() @IsOptional() targetDate?: string;
  @IsInt() @Min(0) @Max(100) @IsOptional() progress?: number;
  @IsString() @IsOptional() status?: string;
}
