import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 20;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
