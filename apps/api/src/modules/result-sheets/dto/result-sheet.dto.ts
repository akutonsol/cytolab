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

  @IsBoolean() @IsOptional() viewed?: boolean;
}

export class ResultSheetQueryDto extends PaginationDto {
  @IsString() @IsOptional() recordId?: string;
}
