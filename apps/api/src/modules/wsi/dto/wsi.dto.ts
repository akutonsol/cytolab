import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

// P5-4 Phase B Part 2: CreateSlideDto (the legacy paste-URL creation body, incl. `slideUrl`) was retired.
// Slides are created only via the authenticated ingestion pipeline (see wsi/ingestion/dto).

export class CreateAnnotationDto {
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) x!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) y!: number;
  @IsString() @MaxLength(200) label!: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
}

export class UpdateAnnotationDto {
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
}
