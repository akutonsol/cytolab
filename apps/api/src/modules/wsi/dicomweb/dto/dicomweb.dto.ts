import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

/** Program 5C · C3 — DICOMweb source configuration + import contracts. */
export const DICOMWEB_AUTH_TYPES = ['BEARER', 'BASIC'] as const;

export class CreateDicomWebSourceDto {
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  endpointBaseUrl!: string;

  @IsOptional()
  @IsIn(DICOMWEB_AUTH_TYPES as unknown as string[])
  authType?: 'BEARER' | 'BASIC';

  /** Write-only secret (Bearer token, or `user:pass` for Basic). Encrypted at rest; NEVER returned. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  credential?: string;
}

export class ImportSeriesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sourceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  studyInstanceUID!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  seriesInstanceUID!: string;
}

export class DiscoverQueryDto {
  @IsString()
  @MaxLength(64)
  sourceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  studyInstanceUID?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  seriesInstanceUID?: string;
}
