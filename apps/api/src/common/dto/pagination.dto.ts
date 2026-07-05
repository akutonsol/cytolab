import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

// Hard upper bound on page size (QA-M1): prevents unbounded PHI pulls and
// resource-exhaustion via oversized pages. Requests above this are rejected 400.
// Set to 500 (not 200) because existing "fetch-wide" UI dropdowns legitimately
// request up to pageSize=500; 200 would break ~16 call sites. 500 still bounds
// the endpoint (999999 is rejected). Reducing further needs those callers moved
// to real pagination first.
export const MAX_PAGE_SIZE = 500;

export class PaginationDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
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
