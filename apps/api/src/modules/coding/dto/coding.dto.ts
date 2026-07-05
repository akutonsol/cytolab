import { CodeSystem, CodingType } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CodeQueryDto {
  @IsOptional() @IsEnum(CodeSystem) system?: CodeSystem;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() search?: string;
}

export class CreateCodeDto {
  @IsEnum(CodeSystem) system!: CodeSystem;
  @IsString() @MaxLength(40) code!: string;
  @IsString() @MaxLength(300) display!: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
}

export class UpdateCodeDto {
  @IsOptional() @IsString() @MaxLength(300) display?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignCodeDto {
  @IsString() codeId!: string;
  @IsEnum(CodingType) codeType!: CodingType;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ExportQueryDto {
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}
