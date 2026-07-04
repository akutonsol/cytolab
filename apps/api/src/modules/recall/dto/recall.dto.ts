import { RecallStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RecallQueryDto {
  @IsOptional() @IsEnum(RecallStatus) status?: RecallStatus;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() dueBefore?: string;
  @IsOptional() @IsString() dueAfter?: string;
}

export class UpdateRecallDto {
  @IsOptional() @IsEnum(RecallStatus) status?: RecallStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CompleteRecallDto {
  @IsOptional() @IsString() completedRecordId?: string;
}

export class NotesDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ManualRecallDto {
  @IsString() patientId!: string;
  @IsString() triggerRecordId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(120) intervalMonths!: number;
  @IsOptional() @IsString() @MaxLength(200) diagnosis?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class GenerateListQueryDto {
  @IsOptional() @IsEnum(RecallStatus) status?: RecallStatus;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() dueBefore?: string;
}
