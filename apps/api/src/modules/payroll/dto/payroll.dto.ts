import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ProcessPayrollDto {
  // Period as YYYY-MM.
  @Matches(/^\d{4}-\d{2}$/, { message: 'period must be YYYY-MM' })
  period!: string;
}

export class UpdatePayAdviceDto {
  @IsInt() @Min(0) @IsOptional() overtime?: number;
  @IsInt() @Min(0) @IsOptional() allowances?: number;
  @IsInt() @Min(0) @IsOptional() otherDeductions?: number;
}

export class PayrollQueryDto extends PaginationDto {}

export class PayAdviceQueryDto extends PaginationDto {
  @IsString() @IsOptional() period?: string;
  @IsString() @IsOptional() employeeId?: string;
}
