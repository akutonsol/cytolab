import { CaseDifficulty, ConfidenceLevel, ProfTestStatus, ProfTestType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTestDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsEnum(ProfTestType) testType?: ProfTestType;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) passingScore?: number;
}

export class UpdateTestDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsEnum(ProfTestStatus) status?: ProfTestStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) passingScore?: number;
}

export class TestQueryDto {
  @IsOptional() @IsEnum(ProfTestStatus) status?: ProfTestStatus;
  @IsOptional() @IsEnum(ProfTestType) testType?: ProfTestType;
}

export class CreateCaseDto {
  @IsString() @MaxLength(120) specimenType!: string;
  @IsOptional() @IsString() @MaxLength(2000) clinicalHistory?: string;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsString() @MaxLength(500) expectedDiagnosis!: string;
  @IsOptional() @IsString() @MaxLength(120) expectedBethesda?: string;
  @IsOptional() @IsEnum(CaseDifficulty) difficulty?: CaseDifficulty;
}

export class UpdateCaseDto {
  @IsOptional() @IsString() @MaxLength(120) specimenType?: string;
  @IsOptional() @IsString() @MaxLength(2000) clinicalHistory?: string;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) expectedDiagnosis?: string;
  @IsOptional() @IsString() @MaxLength(120) expectedBethesda?: string;
  @IsOptional() @IsEnum(CaseDifficulty) difficulty?: CaseDifficulty;
}

export class RespondDto {
  @IsString() caseId!: string;
  @IsString() @MaxLength(500) diagnosis!: string;
  @IsOptional() @IsString() @MaxLength(120) bethesdaAnswer?: string;
  @IsOptional() @IsEnum(ConfidenceLevel) confidence?: ConfidenceLevel;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
