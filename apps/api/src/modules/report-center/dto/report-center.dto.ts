import { IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() groupBy?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() userId?: string;
}
