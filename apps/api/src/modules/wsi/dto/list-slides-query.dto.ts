import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import type { SlideLifecycleState } from '../slide-lifecycle';

const LIFECYCLE_STATES: SlideLifecycleState[] = ['DRAFT', 'PROCESSING', 'READY', 'QC_FAILED', 'PUBLISHED'];
const TILE_SOURCE_TYPES = ['IMAGE', 'DZI', 'IIIF', 'DICOMWEB'];
const SORTS = ['newest', 'oldest'] as const;
export type SlideSort = (typeof SORTS)[number];

/**
 * P5-5 — server-side slide discovery query. Tenant scoping is applied automatically (LabContext + Prisma
 * tenancy extension); this DTO carries ONLY the authorized search/filter/sort/pagination inputs. Discovery
 * requires `record:view`; it is NOT authority to view image data (delivery remains `wsi:view`-gated).
 */
export class ListSlidesQueryDto extends PaginationDto {
  /** Free-text: patient name, record lab/accession number, stain, scanner, format. */
  @IsOptional() @IsString() @MaxLength(200) q?: string;

  /** Scope to a single record (already an indexed column). */
  @IsOptional() @IsString() recordId?: string;

  /** P5-7: scope to a single specimen (already an indexed column). Additive; tenant scoping still applies,
   *  so a manipulated specimenId can only ever match slides already visible under the caller's record scope. */
  @IsOptional() @IsString() specimenId?: string;

  /** Truthful lifecycle state filter (see slide-lifecycle.ts). */
  @IsOptional() @IsIn(LIFECYCLE_STATES) status?: SlideLifecycleState;

  @IsOptional() @IsString() @MaxLength(80) stain?: string;
  @IsOptional() @IsString() @MaxLength(120) scanner?: string;
  @IsOptional() @IsString() @MaxLength(40) format?: string;
  @IsOptional() @IsIn(TILE_SOURCE_TYPES) tileSourceType?: string;

  /** Only newest-first (default) or oldest-first; deterministic secondary order by id. */
  @IsOptional() @IsIn(SORTS) sort?: SlideSort;
}
