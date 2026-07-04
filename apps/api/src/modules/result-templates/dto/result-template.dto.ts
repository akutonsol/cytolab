import { TemplateCategory } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateResultTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsEnum(TemplateCategory) @IsOptional() category?: TemplateCategory;
  @IsString() @IsOptional() @MaxLength(20) shortCode?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsString() @IsOptional() specimenAdequacy?: string;
  @IsString() @IsOptional() generalCategory?: string;
  @IsString() @IsOptional() interpretation?: string;
  @IsString() @IsOptional() recommendation?: string;
  @IsString() @IsOptional() additionalNotes?: string;
  @IsArray() @IsOptional() findings?: { key: string; value: string }[];
}

export class UpdateResultTemplateDto {
  @IsString() @IsOptional() @MaxLength(200) name?: string;
  @IsEnum(TemplateCategory) @IsOptional() category?: TemplateCategory;
  @IsString() @IsOptional() @MaxLength(20) shortCode?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsString() @IsOptional() specimenAdequacy?: string;
  @IsString() @IsOptional() generalCategory?: string;
  @IsString() @IsOptional() interpretation?: string;
  @IsString() @IsOptional() recommendation?: string;
  @IsString() @IsOptional() additionalNotes?: string;
  @IsArray() @IsOptional() findings?: { key: string; value: string }[];
}
