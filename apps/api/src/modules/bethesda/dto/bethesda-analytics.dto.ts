import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyticsSummaryQueryDto {
  @IsOptional() @IsIn(['month', 'quarter', 'year', 'all']) period?: 'month' | 'quarter' | 'year' | 'all';
  @IsOptional() @Type(() => Number) @IsInt() year?: number;
  @IsOptional() @Type(() => Number) @IsInt() month?: number;
}

export class AnalyticsTrendQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() months?: number;
}
