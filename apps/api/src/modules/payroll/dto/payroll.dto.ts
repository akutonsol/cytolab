import { Type } from 'class-transformer';
import {
  IsArray, IsInt, IsISO8601, IsOptional, IsString, Matches, Min, ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// Per-employee earnings/deductions captured in the wizard's Earnings step.
export class PayrollLineDto {
  @IsString() employeeId!: string;
  @IsInt() @Min(0) @IsOptional() hoursWorked?: number;
  @IsInt() @Min(0) @IsOptional() overtime?: number;
  @IsInt() @Min(0) @IsOptional() allowances?: number;
  @IsInt() @Min(0) @IsOptional() commission?: number;
  @IsInt() @Min(0) @IsOptional() bonus?: number;
  @IsInt() @Min(0) @IsOptional() pension?: number;
  @IsInt() @Min(0) @IsOptional() reimbursement?: number;
  @IsInt() @Min(0) @IsOptional() otherDeductions?: number;
}

export class ProcessPayrollDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'period must be YYYY-MM' })
  period!: string;

  @IsISO8601() @IsOptional() payrollDate?: string;

  // Optional per-employee overrides; employees without a line get zeros.
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => PayrollLineDto)
  lines?: PayrollLineDto[];
}

export class ApproveRunDto {
  @IsString() @IsOptional() notes?: string;
}

export class UpdatePayAdviceDto {
  @IsInt() @Min(0) @IsOptional() overtime?: number;
  @IsInt() @Min(0) @IsOptional() allowances?: number;
  @IsInt() @Min(0) @IsOptional() commission?: number;
  @IsInt() @Min(0) @IsOptional() bonus?: number;
  @IsInt() @Min(0) @IsOptional() pension?: number;
  @IsInt() @Min(0) @IsOptional() reimbursement?: number;
  @IsInt() @Min(0) @IsOptional() hoursWorked?: number;
  @IsInt() @Min(0) @IsOptional() otherDeductions?: number;
}

export class PayrollQueryDto extends PaginationDto {}

export class PayAdviceQueryDto extends PaginationDto {
  @IsString() @IsOptional() period?: string;
  @IsString() @IsOptional() employeeId?: string;
}
