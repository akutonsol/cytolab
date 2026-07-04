import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateResultLineDto {
  @IsString() @IsOptional() abbreviation?: string;
  @IsString() @IsOptional() result?: string;
  @IsString() @IsOptional() findings?: string;
  @IsBoolean() @IsOptional() abnormalFinding?: boolean;
}

export class CreateResultEntryDto {
  @IsString() @IsOptional() specimenId?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateResultLineDto)
  lines?: CreateResultLineDto[];
}

export class CreateResultSheetDto {
  @IsString() @IsNotEmpty() recordId!: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateResultEntryDto)
  entries?: CreateResultEntryDto[];
}

export class UpdateResultSheetDto {
  // When provided, replaces the entire set of entries/lines and re-opens the
  // sheet for authorization.
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateResultEntryDto)
  entries?: CreateResultEntryDto[];

  // Human-owned report narrative. Editing it (incl. accepting an AI draft into
  // it) re-opens the sheet just like editing entries.
  @IsString() @IsOptional() narrative?: string;

  @IsBoolean() @IsOptional() viewed?: boolean;
}

export class ResultSheetQueryDto extends PaginationDto {
  @IsString() @IsOptional() recordId?: string;
}

export class AuthorizeResultSheetDto {
  // Optional signature the authorizer signs with (PNG data URI). When present it
  // becomes the authorizer's stored signature, which the report renders in place
  // of the typed-name fallback.
  @IsString() @IsOptional() signature?: string;
}
