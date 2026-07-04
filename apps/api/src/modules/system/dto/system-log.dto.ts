import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const LOG_TYPES = [
  'RECORD_STATUS',
  'AUTH',
  'AUTHORIZATION',
  'CHANGE_REQUEST',
  'PAYMENT',
  'MAINTENANCE',
  'FEATURE',
  'ASSIGNMENT',
] as const;
export type LogType = (typeof LOG_TYPES)[number];

export class SystemLogQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(LOG_TYPES as unknown as string[])
  type?: LogType;

  @IsOptional()
  @IsString()
  userId?: string;

  /** ISO date (inclusive lower bound on the event time). */
  @IsOptional()
  @IsString()
  from?: string;

  /** ISO date (inclusive upper bound on the event time). */
  @IsOptional()
  @IsString()
  to?: string;
}
